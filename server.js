const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
});
const User = mongoose.model('User', userSchema);

const accountRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});
const AccountRequest = mongoose.model('AccountRequest', accountRequestSchema);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
});
const Product = mongoose.model('Product', productSchema);

const clientSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  number: { type: String, required: false },
  email: { type: String, required: false },
  fiscalNumber: { type: String, required: true },
});
const Client = mongoose.model('Client', clientSchema);

const orderSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  deliveryDate: { type: Date, required: true },
  paymentType: { type: String, required: true, enum: ['Cash', 'Credit Card', 'Bank Transfer'] },
  status: { type: String, required: true, enum: ['Pending', 'Confirmed', 'Delivered'], default: 'Pending' },
});
const Order = mongoose.model('Order', orderSchema);

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

const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
};

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;
    console.log('Received account request:', { name, surname, email, password: '[hidden]' });
    if (!name || !surname || !email || !password) {
      return res.status(400).json({ message: 'Nom, prénom, email et mot de passe sont requis' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ message: 'Email invalide' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    const existingRequest = await AccountRequest.findOne({ email });
    const existingUser = await User.findOne({ email });
    if (existingRequest) {
      return res.status(400).json({ message: 'Une demande de compte existe déjà pour cet email' });
    }
    if (existingUser) {
      return res.status(400).json({ message: 'Un compte utilisateur existe déjà pour cet email' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const request = new AccountRequest({ name, surname, email, password: hashedPassword });
    await request.save();
    res.status(201).json({ message: 'Demande de compte soumise, en attente d\'approbation' });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password: '[hidden]' });
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for:', email);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/users/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    console.log('Reset password attempt:', { email, newPassword: '[hidden]' });
    if (!email || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Email et mot de passe (6+ caractères) requis' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.get('/api/account-requests', authenticateToken, isAdmin, async (req, res) => {
  try {
    const requests = await AccountRequest.find().sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    console.error('Get account requests error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/account-requests/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Demande déjà traitée' });
    }
    const existingUser = await User.findOne({ email: request.email });
    if (existingUser) {
      return res.status(400).json({ message: 'Un compte utilisateur existe déjà pour cet email' });
    }
    const user = new User({
      name: request.name,
      surname: request.surname,
      email: request.email,
      password: request.password,
      role: 'user',
    });
    await user.save();
    request.status = 'approved';
    await request.save();
    res.status(200).json({ message: 'Compte approuvé et créé' });
  } catch (err) {
    console.error('Approve account error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.post('/api/account-requests/:id/reject', authenticateToken, isAdmin, async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Demande déjà traitée' });
    }
    request.status = 'rejected';
    await request.save();
    res.status(200).json({ message: 'Demande rejetée' });
  } catch (err) {
    console.error('Reject account error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

app.delete('/api/account-requests/cleanup', authenticateToken, isAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await AccountRequest.deleteMany({ status: 'rejected', createdAt: { $lt: thirtyDaysAgo } });
    res.status(200).json({ message: 'Anciennes demandes rejetées supprimées' });
  } catch (err) {
    console.error('Cleanup requests error:', err.message);
    res.status(500).json({ message: 'Erreur serveur: ' + err.message });
  }
});

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
    console.log('Received product data:', { name, quantity });
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
    console.log('Received update product data:', { name, quantity });
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
    console.log('Received client data:', { fullName, number, email, fiscalNumber });
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
    console.log('Received update client data:', { fullName, number, email, fiscalNumber });
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
    console.log('Received order data:', { productId, clientId, deliveryDate, paymentType });
    if (!productId || !clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Produit, client, date de livraison et type de paiement requis' });
    }
    const product = await Product.findById(productId);
    const client = await Client.findById(clientId);
    if (!product) {
      return res.status(404).json({ message: 'Produit non trouvé' });
    }
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    if (product.quantity <= 0) {
      return res.status(400).json({ message: 'Produit en rupture de stock' });
    }
    const order = new Order({ productId, clientId, deliveryDate, paymentType });
    await order.save();
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
    console.log('Received update order data:', { productId, clientId, deliveryDate, paymentType, status });

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

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
