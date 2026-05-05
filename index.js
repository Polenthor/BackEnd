// importing
const express = require("express");
require("./connection");

const cors = require("cors");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const Cart = require("./model/cart");
const userModel = require("./model/user");
const productModel = require("./model/product");

const app = express();

// ---------------- CLOUDINARY CONFIG ----------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: "https://modarc-theta.vercel.app",
  credentials: true
}));

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


// ---------------- PRODUCTS ----------------

// ➕ Add product (NOW USING CLOUDINARY)
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const prices = req.body.prices;
    const stocks = req.body.stocks;

    const imageData = req.files.map((file, index) => ({
      url: file.path, // 🔥 Cloudinary URL
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


// ---------------- CART ----------------

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

// ---------------- PORT ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;