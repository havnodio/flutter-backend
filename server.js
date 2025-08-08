const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
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
    setTimeout(connectDB, 5000);
  }
};
connectDB();

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected, attempting to reconnect...');
  connectDB();
});

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL || 'metjihed@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'xstp vyjs xahh stkc',
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server ready to send emails');
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
  price: { type: Number, required: true, min: 0 },
});
const Product = mongoose.model('Product', productSchema);

const clientSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  number: { type: String },
  email: { type: String },
  fiscalNumber: { type: String, required: true },
});
const Client = mongoose.model('Client', clientSchema);

const orderProductSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
});

const orderSchema = new mongoose.Schema({
  products: [orderProductSchema],
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  deliveryDate: { type: Date, required: true },
  paymentType: { type: String, enum: ['Cash', 'Credit Card', 'Bank Transfer'], required: true },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Delivered'], default: 'Pending' },
  totalAmount: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

// Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role }
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
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
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
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

// Password Reset Endpoints
app.post('/api/users/reset-password-request', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'If this email exists, a reset code has been sent' });
    }
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = resetCode;
    user.resetCodeExpires = Date.now() + 3600000;
    await user.save();
    try {
      const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL}>`,
        to: email,
        subject: 'Password Reset Code',
        text: `Your password reset code is: ${resetCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d3748;">Password Reset Request</h2>
            <p>Your password reset code is:</p>
            <div style="background: #f7fafc; border: 1px solid #e2e8f0; padding: 16px; 
                        font-size: 24px; font-weight: bold; text-align: center; margin: 16px 0;">
              ${resetCode}
            </div>
            <p>This code will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `,
      };
      await transporter.sendMail(mailOptions);
      console.log(`Reset code sent to ${email}`);
      res.status(200).json({ message: 'Reset code sent to email' });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send email, please try again later' });
    }
  } catch (error) {
    console.error('Reset password request error:', error);
    res.status(500).json({ message: 'Server error, please try again' });
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
    res.status(200).json({ message: 'Code verified successfully', email: user.email });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

app.post('/api/users/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.resetCode) {
      return res.status(400).json({ message: 'Password reset not requested' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();
    console.log(`Password reset for ${email}`);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
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
    const query = req.query.search
      ? { name: { $regex: req.query.search, $options: 'i' } }
      : {};
    const products = await Product.find(query).select('name price quantity');
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
    const query = req.query.search
      ? {
          $or: [
            { fullName: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } },
            { fiscalNumber: { $regex: req.query.search, $options: 'i' } },
          ],
        }
      : {};
    const clients = await Client.find(query).select('fullName email number fiscalNumber');
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

app.get('/api/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find().populate('clientId', 'fullName email fiscalNumber').lean();
    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

app.post('/api/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { products, clientId, deliveryDate, paymentType, status } = req.body;
    console.log('Received order data:', { products, clientId, deliveryDate, paymentType, status });
    if (!products || !clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Products, clientId, deliveryDate, and paymentType required' });
    }
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    let totalAmount = 0;
    for (const p of products) {
      const product = await Product.findById(p.productId);
      if (!product) return res.status(404).json({ message: `Product ${p.productId} not found` });
      if (product.quantity < p.quantity) return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      if (p.price !== product.price) return res.status(400).json({ message: `Price mismatch for ${product.name}` });
      totalAmount += p.quantity * p.price;
    }

    const order = new Order({
      products,
      clientId,
      deliveryDate,
      paymentType,
      status: status || 'Pending',
      totalAmount,
    });

    await order.save();
    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
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
