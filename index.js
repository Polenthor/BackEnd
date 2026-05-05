// ---------------- IMPORTS ----------------
const express = require("express");
require("./connection");

const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// MODELS
const Order = require("./model/order");
const Cart = require("./model/cart");
const userModel = require("./model/user");
const productModel = require("./model/product");

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ FIXED CORS (THIS SOLVES YOUR ERROR)
const allowedOrigins = [
  "https://modarc-theta.vercel.app",
  "https://empapp-32pt5vs2p-polenthors-projects.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman / mobile

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // ✅ TEMP allow all (debug mode)
    }
  },
  credentials: true
}));

// VERY IMPORTANT
app.options("*", cors());

app.options("*", cors()); // preflight fix

// ✅ Serve images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------------- BASIC ROUTES ----------------
app.get("/", (req, res) => res.send("Server Running"));
app.get("/trail", (req, res) => res.send("Trail OK"));

// ---------------- USER ----------------

// signup
app.post("/signup", async (req, res) => {
  try {
    const newUser = new userModel(req.body);
    await newUser.save();
    res.send("User created");
  } catch (err) {
    res.status(500).send("Signup failed");
  }
});

// login
app.post("/login", async (req, res) => {
  try {
    console.log("LOGIN BODY:", req.body); // debug

    const { Username, Password } = req.body;

    if (!Username || !Password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const user = await userModel.findOne({ Username });

    if (!user) {
      return res.status(404).json({ message: "Invalid username" });
    }

    if (user.Password !== Password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.json(user);

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------- MULTER ----------------
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

// ---------------- PRODUCTS ----------------

// add product
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const { prices, stocks, name } = req.body;

    const BASE_URL = "https://backend-production-400ff.up.railway.app";

    const imageData = req.files.map((file, index) => ({
      url: `${BASE_URL}/uploads/${file.filename}`,
      price: Number(prices[index]) || 0,
      stock: Number(stocks[index]) || 0
    }));

    const product = new productModel({ name, image: imageData });

    await product.save();
    res.json(product);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// get products
app.get("/products", async (req, res) => {
  try {
    const data = await productModel.find();
    res.json(data);
  } catch {
    res.status(500).send("Error fetching products");
  }
});

// ---------------- CART ----------------

app.post("/cart/add", async (req, res) => {
  try {
    const { userId, product } = req.body;

    let cart = await Cart.findOne({ userId });

    if (!cart) cart = new Cart({ userId, items: [] });

    const existing = cart.items.find(
      item => item.productId.toString() === product.productId
    );

    if (existing) existing.quantity++;
    else cart.items.push({ ...product, quantity: 1 });

    await cart.save();
    res.json(cart);

  } catch {
    res.status(500).json({ message: "Cart error" });
  }
});

app.get("/cart/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });
    res.json(cart || { items: [] });
  } catch {
    res.status(500).json({ message: "Cart fetch error" });
  }
});

app.delete("/cart/remove/:userId/:productId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });

    cart.items = cart.items.filter(
      item => item.productId.toString() !== req.params.productId
    );

    await cart.save();
    res.json(cart);
  } catch {
    res.status(500).json({ message: "Delete error" });
  }
});

app.post("/cart/decrease", async (req, res) => {
  const { userId, productId } = req.body;

  const cart = await Cart.findOne({ userId });

  const item = cart.items.find(i => i.productId.toString() === productId);

  if (item) {
    item.quantity--;
    if (item.quantity <= 0) {
      cart.items = cart.items.filter(i => i.productId.toString() !== productId);
    }
  }

  await cart.save();
  res.json(cart);
});

// ---------------- RAZORPAY ----------------

// ✅ ONLY ONE INSTANCE (FIXED)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// create order
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    });

    res.json(order);

  } catch (err) {
    res.status(500).send("Order failed");
  }
});

// verify payment
app.post("/payment/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      products,
      amount
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign === razorpay_signature) {

      const order = new Order({
        userId,
        products,
        amount,
        razorpay_order_id,
        razorpay_payment_id,
        status: "Paid"
      });

      await order.save();

      res.json({ success: true });

    } else {
      res.status(400).json({ success: false });
    }

  } catch {
    res.status(500).send("Verification failed");
  }
});
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

module.exports = app;