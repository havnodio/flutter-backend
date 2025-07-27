const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
});
const Product = mongoose.model('Product', productSchema);

// Client Schema
const clientSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  raison_sociale: { type: String, required: true },
  telephone: { type: String, required: true },
  adresse: { type: String, required: true },
  code_postal: { type: String, required: true },
  code_fiscal: { type: String, required: true },
});
const Client = mongoose.model('Client', clientSchema);

// Order Schema (Placeholder)
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  status: { type: String, required: true },
});
const Order = mongoose.model('Order', orderSchema);

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    console.log('No Authorization header provided');
    return res.status(401).json({ message: 'Aucun jeton fourni' });
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('Invalid token:', err.message);
    res.status(403).json({ message: 'Jeton invalide' });
  }
};

// User Routes
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;
    if (!name || !surname || !email || !password) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Utilisateur déjà existant' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, surname, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Product Routes
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, quantity } = req.body;
    if (!name || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ message: 'Nom et quantité requis' });
    }
    const product = new Product({ name, quantity });
    await product.save();
    res.status(201).json({ message: 'Produit ajouté', product });
  } catch (err) {
    console.error('Add product error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { name, quantity } = req.body;
    if (!name || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ message: 'Nom et quantité requis' });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, quantity },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' });
    res.json({ message: 'Produit modifié', product });
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' });
    await Product.deleteOne({ _id: req.params.id });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ message: 'Erreur lors de la suppression: ' + err.message });
  }
});

// Client Routes
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { nom, prenom, raison_sociale, telephone, adresse, code_postal, code_fiscal } = req.body;
    if (!nom || !prenom || !raison_sociale || !telephone || !adresse || !code_postal || !code_fiscal) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }
    const client = new Client({ nom, prenom, raison_sociale, telephone, adresse, code_postal, code_fiscal });
    await client.save();
    res.status(201).json({ message: 'Client ajouté', client });
  } catch (err) {
    console.error('Add client error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Order Routes (Placeholder)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
