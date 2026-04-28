// importing
const express=require("express")
require('./connection')

var cors = require('cors')


const multer = require("multer");

const path = require("path");
const fs = require("fs");
const userModel = require("./model/user");



const uploadPath = "uploads/";
const app = express()
app.use(express.json())
app.use(cors())
app.use("/uploads", express.static("uploads"));

app.use(express.urlencoded({ extended: true }));



// inistialization
app.get('/', (req, res) => {
  res.send('Hello Word')
})
app.get('/product/:id',function(req,res,next){
    res.json({msg:'Cors Enabled'})
})

app.get('/trail', (req, res) => {
  res.send('trail message')

})

app.post("/add",async(req,res) =>{
    await employModel(req.body).save()
    res.send("data added succesfully")
}
)
app.get("/view",async(req,res) =>{
    var data =await user.find()
    res.send(data)
}
)
app.delete("/remove/:id",async(req,res) =>{
    await employModel.findByIdAndDelete(req.params.id)
    res.send("data succesfully deleted")
}
)
app.put("/edit/:id",async(req,res) =>{
     await employModel.findByIdAndUpdate(req.params.id,req.body)
    res.send("Updated")
})

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

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// 🗄️ temporary storage (array instead of DB)
let products = [];

// ➕ Add product
// ➕ Add product (Handling multiple files)
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const prices = req.body.prices;
    const stocks = req.body.stocks; // <--- Get from body

    const imageData = req.files.map((file, index) => ({
      url: `http://localhost:3000/uploads/${file.filename}`,
      price: Number(prices[index]) || 0,
      stock: Number(stocks[index]) || 0 // <--- Map it here
    }));

    const newProduct = new productModel({
      name: req.body.name,
      image: imageData 
    });

    await newProduct.save();
    res.status(200).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const productModel = require("./model/product"); 
const user = require("./model/user");

app.get("/products", async (req, res) => {
  try {
    const data = await productModel.find();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
app.post('/login', async (req, res) => {
    try {
        const { Username, Password } = req.body;
        console.log("Login attempt for:", Username); // DEBUG LOG

        // 1. Rename variable to 'foundUser' to avoid conflict with global 'user'
        const foundUser = await userModel.findOne({ Username: Username });

        if (!foundUser) {
            console.log("User not found in DB");
            return res.status(404).json({ message: "Invalid username" });
        }

        // 2. Simple string comparison (In production, use bcrypt.compare)
        if (foundUser.Password !== Password) {
            console.log("Password mismatch");
            return res.status(401).json({ message: "Invalid password" });
        }

        console.log("Login successful");
        res.status(200).json(foundUser);

    } catch (err) {
        console.error("Login Server Error:", err);
        res.status(500).json({ message: "Server error during login" });
    }
});
// port setting
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
module.exports = app;
