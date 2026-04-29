// importing
const express = require("express");
require("./connection");

const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const userModel = require("./model/user");
const productModel = require("./model/product");

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: "https://modarc-theta.vercel.app",
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


// ---------------- PORT ----------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;