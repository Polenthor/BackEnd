// importing
const express = require("express");
require("./connection");

const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Cart = require("./model/cart");
const userModel = require("./model/user");
const productModel = require("./model/product");

const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "https://modarc-theta.vercel.app",
  "https://empapp-32pt5vs2p-polenthors-projects.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow Postman

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("CORS not allowed"));
    }
  },
  credentials: true
}));

// ✅ Serve images properly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// ---------------- ROUTES ----------------

// test routes
app.get("/", (req, res) => {
  res.send("Hello World");
});

app.get("/trail", (req, res) => {
  res.send("trail message");
});


// ---------------- USER ----------------

// signup
app.post("/signup", async (req, res) => {
  try {
    const newUser = new userModel(req.body);
    await newUser.save();
    res.send("User created");
  } catch (err) {
    console.error(err);
    res.status(500).send("Signup failed");
  }
});

// login
app.post("/login", async (req, res) => {
  try {
    const { Username, Password } = req.body;

    const foundUser = await userModel.findOne({ Username });

    if (!foundUser) {
      return res.status(404).json({ message: "Invalid username" });
    }

    if (foundUser.Password !== Password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.status(200).json(foundUser);

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ---------------- MULTER (FIXED STORAGE) ----------------

// ✅ IMPORTANT: use /tmp in Railway, but also serve correctly
const uploadDir = path.join(__dirname, "uploads");

// ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // ✅ NOT /tmp anymore
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });


// ---------------- PRODUCTS ----------------

// ➕ Add product
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const prices = req.body.prices;
    const stocks = req.body.stocks;

    // ✅ FIX: use Railway backend URL
    const BASE_URL = "https://backend-production-400ff.up.railway.app";

    const imageData = req.files.map((file, index) => ({
      url: `${BASE_URL}/uploads/${file.filename}`, // ✅ FIXED
      price: Number(prices[index]) || 0,
      stock: Number(stocks[index]) || 0
    }));

    const newProduct = new productModel({
      name: req.body.name,
      image: imageData
    });

    await newProduct.save();

    res.status(200).json(newProduct);

  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ error: err.message });
  }
});


// 📦 Get products
app.get("/products", async (req, res) => {
  try {
    const data = await productModel.find();
    res.json(data);
  } catch (err) {
    console.error("Products error:", err);
    res.status(500).send("Server error");
  }
});


app.post("/cart/add", async (req, res) => {
  try {
    const { userId, product } = req.body;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existing = cart.items.find(
      item => item.productId.toString() === product.productId
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.items.push({ ...product, quantity: 1 });
    }

    await cart.save();
    res.json(cart);

  } catch (err) {
    res.status(500).json({ message: "Error adding to cart" });
  }
}); 


app.get("/cart/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });
    res.json(cart || { items: [] });
  } catch (err) {
    res.status(500).json({ message: "Error fetching cart" });
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

  } catch (err) {
    res.status(500).json({ message: "Error removing item" });
  }
});
 
app.post("/cart/decrease", async (req, res) => {
  const { userId, productId } = req.body;

  const cart = await Cart.findOne({ userId });

  const item = cart.items.find(
    i => i.productId.toString() === productId
  );

  if (item) {
    item.quantity -= 1;

    if (item.quantity <= 0) {
      cart.items = cart.items.filter(
        i => i.productId.toString() !== productId
      );
    }
  }

  await cart.save();
  res.json(cart);
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      receipt: "order_rcptid_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json(order);

  } catch (err) {
    console.error(err);
    res.status(500).send("Payment error");
  }
});

app.post("/payment/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const sign = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest("hex");

  if (expectedSign === razorpay_signature) {
    return res.json({ success: true });
  } else {
    return res.status(400).json({ success: false });
  }
});


// ---------------- PORT ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;