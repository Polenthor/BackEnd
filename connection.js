const mongoose = require('mongoose');
require('dotenv').config(); // Load variables from a .env file

// Use an environment variable for the URI
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://aboobacker:aboobacker@cluster0.zvwxqje.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log('Connected Successfully to MongoDB'))
  .catch((err) => console.log('Connection Error:', err));