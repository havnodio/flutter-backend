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
    user: process.env.EMAIL || 'metjihed@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'xstp vyjs xahh stkc'
  },
});

// Verify SMTP connection on startup
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
<<<<<<< HEAD
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
  },
  products: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  }],
  deliveryDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Delivered'],
    default: 'Pending',
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;

=======
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  }],
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  deliveryDate: { type: Date, required: true },
  paymentType: { type: String, required: true, enum: ['Cash', 'Credit Card', 'Bank Transfer'] },
  status: { type: String, required: true, enum: ['Pending', 'Confirmed', 'Delivered'], default: 'Pending' },
  totalAmount: { type: Number, required: true, min: 0 }
}, { timestamps: true });
const Order = mongoose.model('Order', orderSchema);

>>>>>>> f3af17a89c5c685b95db65c5e585a0e3ea022f78
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
    user.resetCodeExpires = Date.now() + 3600000; // 1 hour
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
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`Reset code sent to ${email}`);
      res.status(200).json({ message: 'Reset code sent to email' });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      await user.save();
      return res.status(500).json({ 
        message: 'Failed to send email, please try again later' 
      });
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

    res.status(200).json({ 
      message: 'Code verified successfully',
      email: user.email 
    });
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

<<<<<<< HEAD
arouter.get('/api/clients', authMiddleware, async (req, res) => {
  try {
    const clients = await Client.find();
    res.status(200).json(clients);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
=======
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await Client.find();
    res.status(200).json(clients);
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
>>>>>>> f3af17a89c5c685b95db65c5e585a0e3ea022f78
  }
});

// Create a client
router.post('/api/clients', authMiddleware, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
<<<<<<< HEAD
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Full name and fiscal number are required' });
    }
    if (email && !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    const client = new Client({ fullName, number, email, fiscalNumber });
    await client.save();
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Update a client
router.put('/api/clients/:id', authMiddleware, async (req, res) => {
  try {
    const { fullName, number, email, fiscalNumber } = req.body;
    if (!fullName || !fiscalNumber) {
      return res.status(400).json({ message: 'Full name and fiscal number are required' });
    }
    if (email && !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { fullName, number, email, fiscalNumber },
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.status(200).json(client);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Delete a client
router.delete('/api/clients/:id', authMiddleware, async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.status(200).json({ message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

router.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('clientId', 'fullName')
      .populate('products._id', 'name price quantity');
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get a single order
router.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('clientId', 'fullName')
      .populate('products._id', 'name price quantity');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Create a new order
router.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { clientId, products, deliveryDate, status, totalAmount } = req.body;

    // Validate client
    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ message: 'Invalid client ID' });

    // Validate products
    for (const product of products) {
      const prod = await Product.findById(product._id);
      if (!prod) return res.status(400).json({ message: `Invalid product ID: ${product._id}` });
      if (product.quantity <= 0) return res.status(400).json({ message: 'Invalid product quantity' });
    }

    const order = new Order({
      clientId,
      products,
      deliveryDate,
      status,
      totalAmount,
    });

    await order.save();
    const populatedOrder = await Order.findById(order._id)
      .populate('clientId', 'fullName')
      .populate('products._id', 'name price quantity');
    res.status(201).json(populatedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Update an order
router.put('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const { clientId, products, deliveryDate, status, totalAmount } = req.body;

    // Validate client
    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ message: 'Invalid client ID' });

    // Validate products
    for (const product of products) {
      const prod = await Product.findById(product._id);
      if (!prod) return res.status(400).json({ message: `Invalid product ID: ${product._id}` });
      if (product.quantity <= 0) return res.status(400).json({ message: 'Invalid product quantity' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { clientId, products, deliveryDate, status, totalAmount },
      { new: true }
    )
      .populate('clientId', 'fullName')
      .populate('products._id', 'name price quantity');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Delete an order
router.delete('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

module.exports = router;
=======
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
      .populate('products.productId', 'name description category')
      .populate('clientId', 'fullName email phone');
    res.status(200).json(orders);
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { products, clientId, deliveryDate, paymentType, status } = req.body;

    // Validation
    if (!products || !Array.isArray(products) || products.length === 0) {
      console.log('Invalid products array:', products);
      return res.status(400).json({ message: 'Products must be an array' });
    }
    if (!clientId || !deliveryDate || !paymentType) {
      return res.status(400).json({ message: 'Client, delivery date, and payment type are required' });
    }

    // Check client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Process products
    let totalAmount = 0;
    const productUpdates = [];
    const validatedProducts = [];

    for (const item of products) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ message: 'Invalid product data' });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.quantity}`
        });
      }

      // Calculate price (use product price if not provided in request)
      const price = item.price || product.price;
      totalAmount += price * item.quantity;

      validatedProducts.push({
        productId: product._id,
        quantity: item.quantity,
        price: price
      });

      // Prepare inventory update
      productUpdates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $inc: { quantity: -item.quantity } }
        }
      });
    }

    // Create order
    const order = new Order({
      products: validatedProducts,
      clientId,
      deliveryDate,
      paymentType,
      status: status || 'Pending',
      totalAmount
    });

    // Execute all operations in a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await order.save({ session });
      await Product.bulkWrite(productUpdates, { session });
      await session.commitTransaction();
      session.endSession();

      // Populate the created order for response
      const populatedOrder = await Order.findById(order._id)
        .populate('products.productId', 'name description category')
        .populate('clientId', 'fullName email phone');

      res.status(201).json({ message: 'Order created successfully', order: populatedOrder });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }

  } catch (err) {
    console.error('Full error:', err);
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { products, clientId, deliveryDate, paymentType, status } = req.body;
    const orderId = req.params.id;

    // Validation
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'At least one product is required' });
    }
    if (!clientId || !deliveryDate || !paymentType || !status) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Get existing order to restore stock if needed
    const existingOrder = await Order.findById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Process products
    let totalAmount = 0;
    const productUpdates = [];
    const validatedProducts = [];

    // First restore quantities from existing order
    for (const existingItem of existingOrder.products) {
      productUpdates.push({
        updateOne: {
          filter: { _id: existingItem.productId },
          update: { $inc: { quantity: existingItem.quantity } }
        }
      });
    }

    // Then process new quantities
    for (const item of products) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ message: 'Invalid product data' });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.quantity}`
        });
      }

      // Calculate price (use product price if not provided in request)
      const price = item.price || product.price;
      totalAmount += price * item.quantity;

      validatedProducts.push({
        productId: product._id,
        quantity: item.quantity,
        price: price
      });

      // Prepare inventory update
      productUpdates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $inc: { quantity: -item.quantity } }
        }
      });
    }

    // Update order in transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update product quantities
      await Product.bulkWrite(productUpdates, { session });

      // Update order
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          products: validatedProducts,
          clientId,
          deliveryDate,
          paymentType,
          status,
          totalAmount
        },
        { new: true, session }
      ).populate('products.productId', 'name description category')
       .populate('clientId', 'fullName email phone');

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({ message: 'Order updated successfully', order: updatedOrder });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }

  } catch (err) {
    console.error('Update order error:', err.message);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get order first to restore product quantities
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Order not found' });
      }

      // Prepare product quantity updates
      const productUpdates = order.products.map(item => ({
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { quantity: item.quantity } }
        }
      }));

      // Restore product quantities
      if (productUpdates.length > 0) {
        await Product.bulkWrite(productUpdates, { session });
      }

      // Delete the order
      await Order.deleteOne({ _id: orderId }).session(session);

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({ message: 'Order deleted successfully' });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }

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

>>>>>>> f3af17a89c5c685b95db65c5e585a0e3ea022f78
// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});