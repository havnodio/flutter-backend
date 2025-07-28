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
  fullName: { type: String, required: true },
  number: { type: String, required: false },
  email: { type: String, required: false },
  fiscalNumber: { type: String, required: true },
});
const Client = mongoose.model('Client', clientSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  deliveryDate: { type: Date, required: true },
  paymentType: { type: String, required: true, enum: ['Cash', 'Credit Card', 'Bank Transfer'] },
  status: { type: String, required: true, enum: ['Pending', 'Confirmed', 'Delivered'], default: 'Pending' },
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
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Product Routes
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (err) {
    console.error('Get products error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, quantity } = req.body;
    console.log('Received product data:', req.body);
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
    console.log('Received update product data:', req.body);
    if (!name || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ message: 'Nom et quantité requis' });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, quantity },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: 'Produit non trouvé' });
    }
    res.status(200).json({ message: 'Produit modifié', product });
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Produit non trouvé' });
    }
    await Product.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Produit supprimé' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Client Routes
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await Client.find();
    res.status(200).json(clients);
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
    console.log('Received client data:', req.body);
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Nom complet et numéro fiscal requis' });
    }
    const client = new Client({ fullName, number, email, fiscalNumber });
    await client.save();
    res.status(201).json({ message: 'Client ajouté', client });
  } catch (err) {
    console.error('Add client error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
    console.log('Received update client data:', req.body);
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Nom complet et numéro fiscal requis' });
    }
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { fullName, number, email, fiscalNumber },
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    res.status(200).json({ message: 'Client modifié', client });
  } catch (err) {
    console.error('Update client error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    await Client.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Client supprimé' });
  } catch (err) {
    console.error('Delete client error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

// Order Routes
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('productId', 'name')
      .populate('clientId', 'fullName');
    res.status(200).json(orders);
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { productId, clientId, deliveryDate, paymentType } = req.body;
    console.log('Received order data:', req.body);
    if (!productId || !clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Produit, client, date de livraison et type de paiement requis' });
    }
    // Validate product and client exist
    const product = await Product.findById(productId);
    const client = await Client.findById(clientId);
    if (!product) {
      return res.status(404).json({ message: 'Produit non trouvé' });
    }
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    // Validate quantity
    if (product.quantity <= 0) {
      return res.status(400).json({ message: 'Produit en rupture de stock' });
    }
    const order = new Order({ productId, clientId, deliveryDate, paymentType });
    await order.save();
    // Decrease product quantity
    product.quantity -= 1;
    await product.save();
    res.status(201).json({ message: 'Commande ajoutée', order });
  } catch (err) {
    console.error('Add order error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { productId, clientId, deliveryDate, paymentType, status } = req.body;
    console.log('Received update order data:', req.body);
    if (!productId || !clientId || !deliveryDate || !paymentType || !status) {
      return res.status(400).json({ message: 'Produit, client, date de livraison, type de paiement et statut requis' });
    }
    const product = await Product.findById(productId);
    const client = await Client.findById(clientId);
    if (!product) {
      return res.status(404).json({ message: 'Produit non trouvé' });
    }
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { productId, clientId, deliveryDate, paymentType, status },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    res.status(200).json({ message: 'Commande modifiée', order });
  } catch (err) {
    console.error('Update order error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    await Order.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Commande supprimée' });
  } catch (err) {
    console.error('Delete order error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));