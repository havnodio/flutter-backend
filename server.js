const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' })); // Explicitly allow all origins
app.use(express.json());

// Test route for debugging
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'Server is running', timestamp: new Date().toISOString() });
});

// MongoDB connection with reconnection logic
mongoose.set('strictQuery', true);
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    setTimeout(connectDB, 5000); // Retry after 5 seconds
  }
};
connectDB();

// Handle MongoDB connection errors
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected, attempting to reconnect...');
  connectDB();
});

// Nodemailer configuration for Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});
transporter.verify((error, success) => {
  if (error) {
    console.error('Email config error:', error);
  } else {
    console.log('✅ Email server is ready to take messages');
  }
});

// Verify SMTP connection
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error.message);
  } else {
    console.log('SMTP server ready');
  }
});

// Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  surname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  resetCode: String,
  resetCodeExpires: Date,
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
  price: { type: Number, required: true, min: 0 }, // Added price field
});
const Product = mongoose.model('Product', productSchema);

const clientSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  number: { type: String },
  email: { type: String },
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

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    console.log('No Authorization header provided');
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Invalid token:', err.message);
    res.status(403).json({ message: 'Invalid token' });
  }
};

const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
};

// Routes
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email, password: '[hidden]' });
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error('/api/me error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;
    console.log('Received account request:', { name, surname, email, password: '[hidden]' });
    if (!name || !surname || !email || !password) {
      return res.status(400).json({ message: 'Name, surname, email, and password required' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ message: 'Invalid email' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const existingRequest = await AccountRequest.findOne({ email });
    const existingUser = await User.findOne({ email });
    if (existingRequest) {
      return res.status(400).json({ message: 'Account request already exists for this email' });
    }
    if (existingUser) {
      return res.status(400).json({ message: 'User account already exists for this email' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const request = new AccountRequest({ name, surname, email, password: hashedPassword });
    await request.save();
    res.status(201).json({ message: 'Account request submitted, awaiting approval' });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/users/reset-password-request', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = resetCode;
    user.resetCodeExpires = Date.now() + 3600000;
    await user.save();
    try {
      await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: 'Password Reset Code',
        text: `Your password reset code is: ${resetCode}. It is valid for 1 hour.`,
      });
      console.log(`Reset code sent: { email: "${email}", code: "${resetCode}" }`);
      res.status(200).json({ message: 'Code sent to email' });
    } catch (emailError) {
      console.error('Email sending error:', emailError.message);
      res.status(500).json({ message: 'Failed to send email, but code saved' });
    }
  } catch (error) {
    console.error('Reset password request error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

app.post('/api/users/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }
    res.status(200).json({ message: 'Code verified' });
  } catch (error) {
    console.error('Verify code error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

app.post('/api/users/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();
    console.log(`Password reset successful: ${email}`);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

app.get('/api/account-requests', authenticateToken, isAdmin, async (req, res) => {
  try {
    const requests = await AccountRequest.find().sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    console.error('Get account requests error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/account-requests/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }
    const existingUser = await User.findOne({ email: request.email });
    if (existingUser) {
      return res.status(400).json({ message: 'User account already exists for this email' });
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
    res.status(200).json({ message: 'Account approved and created' });
  } catch (err) {
    console.error('Approve account error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/account-requests/:id/reject', authenticateToken, isAdmin, async (req, res) => {
  try {
    const request = await AccountRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }
    request.status = 'rejected';
    await request.save();
    res.status(200).json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Reject account error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.delete('/api/account-requests/cleanup', authenticateToken, isAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await AccountRequest.deleteMany({ status: 'rejected', createdAt: { $lt: thirtyDaysAgo } });
    res.status(200).json({ message: 'Old rejected requests deleted' });
  } catch (err) {
    console.error('Cleanup requests error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (err) {
    console.error('Get products error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, quantity, price } = req.body;
    console.log('Received product data:', { name, quantity, price });
    if (!name || typeof quantity !== 'number' || quantity < 0 || typeof price !== 'number' || price < 0) {
      return res.status(400).json({ message: 'Name, quantity, and price required' });
    }
    const product = new Product({ name, quantity, price });
    await product.save();
    res.status(201).json({ message: 'Product added', product });
  } catch (err) {
    console.error('Add product error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { name, quantity, price } = req.body;
    console.log('Received update product data:', { name, quantity, price });
    if (!name || typeof quantity !== 'number' || quantity < 0 || typeof price !== 'number' || price < 0) {
      return res.status(400).json({ message: 'Name, quantity, and price required' });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, quantity, price },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json({ message: 'Product updated', product });
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await Product.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await Client.find();
    res.status(200).json(clients);
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
    console.log('Received client data:', { fullName, number, email, fiscalNumber });
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Full name and fiscal number required' });
    }
    const client = new Client({ fullName, number, email, fiscalNumber });
    await client.save();
    res.status(201).json({ message: 'Client added', client });
  } catch (err) {
    console.error('Add client error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
    console.log('Received update client data:', { fullName, number, email, fiscalNumber });
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Full name and fiscal number required' });
    }
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { fullName, number, email, fiscalNumber },
      { new: true }
    );
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.status(200).json({ message: 'Client updated', client });
  } catch (err) {
    console.error('Update client error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    await Client.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('productId', 'name price')
      .populate('clientId', 'fullName');
    res.status(200).json(orders);
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { productId, clientId, deliveryDate, paymentType } = req.body;
    console.log('Received order data:', { productId, clientId, deliveryDate, paymentType });
    if (!productId || !clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Product, client, delivery date, and payment type required' });
    }
    const product = await Product.findById(productId);
    const client = await Client.findById(clientId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    if (product.quantity <= 0) {
      return res.status(400).json({ message: 'Product out of stock' });
    }
    const order = new Order({ productId, clientId, deliveryDate, paymentType });
    await order.save();
    product.quantity -= 1;
    await product.save();
    res.status(201).json({ message: 'Order added', order });
  } catch (err) {
    console.error('Add order error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { productId, clientId, deliveryDate, paymentType, status } = req.body;
    console.log('Received update order data:', { productId, clientId, deliveryDate, paymentType, status });
    if (!productId || !clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Product, client, delivery date, and payment type required' });
    }
    const product = await Product.findById(productId);
    const client = await Client.findById(clientId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { productId, clientId, deliveryDate, paymentType, status },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(200).json({ message: 'Order updated', order });
  } catch (err) {
    console.error('Update order error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    await Order.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Order deleted' });
  } catch (err) {
    console.error('Delete order error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err.stack);
  res.status(500).json({ message: 'Unexpected server error', error: err.message });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});