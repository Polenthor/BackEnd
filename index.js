// ================= IMPORTS =================
const express = require("express");
require("dotenv").config();
require("./connection");

const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const Cart = require("./model/cart");
const Order = require("./model/order");
const userModel = require("./model/user");
const productModel = require("./model/product");
const Contact = require("./model/contact");

const app = express();

// ================= CORS FIX =================
app.use(cors({
  origin: true, // allow all (safe for now)
  credentials: true
}));

// ❌ REMOVE THIS (causes crash)
// app.options("*", cors());

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= STATIC =================
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ================= ROUTES =================

// test
app.get("/", (req, res) => {
  res.send("Backend Running ✅");
});

// ================= USER =================
app.post("/signup", async (req, res) => {
  try {
    const user = new userModel(req.body);
    await user.save();
    res.json({ message: "User created" });
  } catch {
    res.status(500).json({ message: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { Username, Password } = req.body;

    const user = await userModel.findOne({ Username });

    if (!user) {
      return res.status(404).json({ message: "Invalid username" });
    }

    if (user.Password !== Password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.json(user);

  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= PRODUCTS =================
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const BASE_URL = process.env.BASE_URL;

    // ✅ ALWAYS CONVERT TO ARRAY
    const prices = Array.isArray(req.body.prices)
      ? req.body.prices
      : [req.body.prices];

    const stocks = Array.isArray(req.body.stocks)
      ? req.body.stocks
      : [req.body.stocks];

    const imageData = req.files.map((file, index) => ({
      url: `${BASE_URL}/uploads/${file.filename}`,
      price: Number(prices[index]) || 0,
      stock: Number(stocks[index]) || 0
    }));

    const product = new productModel({
      name: req.body.name,
      image: imageData
    });

    await product.save();

    res.json(product);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload error" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const data = await productModel.find();
    res.json(data);
  } catch {
    res.status(500).json({ message: "Fetch error" });
  }
});

// ================= CART =================
// ================= CART =================

// GET CART
app.get("/cart/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });
    res.json(cart || { items: [] });
  } catch (err) {
    res.status(500).json({ message: "Cart fetch error" });
  }
});

// ADD TO CART
app.post("/cart/add", async (req, res) => {
  try {
    const { userId, product } = req.body;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existing = cart.items.find(
      i => i.productId.toString() === product.productId
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.items.push({ ...product, quantity: 1 });
    }

    await cart.save();
    res.json(cart);

  } catch (err) {
    res.status(500).json({ message: "Cart add error" });
  }
});

// REMOVE ITEM
app.delete("/cart/remove/:userId/:productId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items = cart.items.filter(
      i => i.productId.toString() !== req.params.productId
    );

    await cart.save();
    res.json(cart);

  } catch (err) {
    res.status(500).json({ message: "Remove error" });
  }
});

// ================= PAYMENT =================
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100, // convert to paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    res.json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Order creation failed" });
  }
});


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

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    // ✅ Save order
    const newOrder = new Order({
      userId,
      products,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      status: "Paid"
    });

    await newOrder.save();

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Verification failed" });
  }
});

app.get("/admin/messages", async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

app.delete("/admin/message/:id", async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
 app.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const newMessage = new Contact({ name, email, message });
    await newMessage.save();

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: "Failed to send" });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});