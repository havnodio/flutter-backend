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
const transporter = nodemailer.createTransporter({
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
}, {
  timestamps: true
});
const Product = mongoose.model('Product', productSchema);

const clientSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  number: { type: String },
  email: { type: String },
  fiscalNumber: { type: String, required: true },
}, {
  timestamps: true
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
  status: { type: String, enum: ['Pending', 'Confirmed', 'Delivered', 'Cancelled'], default: 'Pending' },
  totalAmount: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save middleware to update the updatedAt field
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
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
    const products = await Product.find(query).select('name price quantity'); // _id included by default
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

app.get('/api/clients/search', authenticateToken, async (req, res) => {
  try {
    const q = req.query.q || '';
    const clients = await Client.find({
      $or: [
        { fullName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { fiscalNumber: { $regex: q, $options: 'i' } },
      ],
    }).limit(10);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
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

// FIXED: Orders endpoint with proper population and pagination
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get orders with proper population
    const orders = await Order.find()
      .populate({
        path: 'clientId',
        select: 'fullName email number fiscalNumber'
      })
      .populate({
        path: 'products.productId',
        select: 'name price'
      })
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Order.countDocuments();
    
    // Return the expected structure
    res.json({ 
      orders, 
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get orders error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// FIXED: Create order with proper validation and stock management
app.post('/api/orders', authenticateToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { products, clientId, deliveryDate, paymentType, status } = req.body;

    // Validation
    if (!Array.isArray(products) || products.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Products array is required and cannot be empty' });
    }
    
    if (!clientId || !deliveryDate || !paymentType) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'clientId, deliveryDate, and paymentType are required' });
    }

    // Validate delivery date is not in the past
    const deliveryDateObj = new Date(deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (deliveryDateObj < today) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Delivery date cannot be in the past' });
    }

    // Check if client exists
    const client = await Client.findById(clientId).session(session);
    if (!client) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Client not found' });
    }

    // Validate products structure
    for (const p of products) {
      if (!p.productId || !p.quantity || !p.price) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Each product must have productId, quantity, and price' });
      }
      if (p.quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Product quantity must be greater than 0' });
      }
      if (p.price < 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Product price cannot be negative' });
      }
    }

    // Get all products and validate
    const productIds = products.map(p => p.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).session(session);

    if (dbProducts.length !== productIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'One or more products not found' });
    }

    // Create product map for quick access
    const productMap = new Map(dbProducts.map(p => [p._id.toString(), p]));

    // Validate stock availability and prices
    let totalAmount = 0;
    const priceEpsilon = 0.01; // Allow 1 cent tolerance for price differences

    for (const orderProduct of products) {
      const dbProduct = productMap.get(orderProduct.productId.toString());
      
      if (!dbProduct) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product ${orderProduct.productId} not found` });
      }
      
      // Check stock availability
      if (dbProduct.quantity < orderProduct.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Insufficient stock for ${dbProduct.name}. Available: ${dbProduct.quantity}, Requested: ${orderProduct.quantity}` 
        });
      }
      
      // Check price match (with small tolerance)
      if (Math.abs(orderProduct.price - dbProduct.price) > priceEpsilon) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          message: `Price mismatch for ${dbProduct.name}. Expected: ${dbProduct.price}, Received: ${orderProduct.price}` 
        });
      }
      
      totalAmount += orderProduct.quantity * dbProduct.price;
    }

    // Create the order
    const orderData = {
      products: products.map(p => ({
        productId: p.productId,
        quantity: p.quantity,
        price: productMap.get(p.productId.toString()).price // Use actual DB price
      })),
      clientId,
      deliveryDate: deliveryDateObj,
      paymentType,
      status: status || 'Pending',
      totalAmount: Math.round(totalAmount * 100) / 100, // Round to 2 decimal places
    };

    const order = new Order(orderData);
    await order.save({ session });

    // Update product stock quantities
    for (const orderProduct of products) {
      await Product.findByIdAndUpdate(
        orderProduct.productId,
        { $inc: { quantity: -orderProduct.quantity } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Populate the order for response
    const populatedOrder = await Order.findById(order._id)
      .populate({
        path: 'clientId',
        select: 'fullName email number fiscalNumber'
      })
      .populate({
        path: 'products.productId',
        select: 'name price'
      });

    res.status(201).json({ 
      message: 'Order created successfully',
      order: populatedOrder 
    });
    
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Create order error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ADDED: Update order status endpoint
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    console.log('Received status update for order ID:', req.params.id, 'Status:', status); // Debug log
    if (!['Pending', 'Confirmed', 'Delivered', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be Pending, Confirmed, Delivered, or Cancelled' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    )
      .populate('clientId', 'fullName email number fiscalNumber')
      .populate('products.productId', 'name price');

    if (!order) {
      console.log('Order not found for ID:', req.params.id); // Debug log
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    console.error('Update order status error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});
// ADDED: Delete order endpoint (with stock restoration)
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only restore stock if order is not delivered
    if (order.status !== 'Delivered') {
      // Restore product stock quantities
      for (const orderProduct of order.products) {
        await Product.findByIdAndUpdate(
          orderProduct.productId,
          { $inc: { quantity: orderProduct.quantity } },
          { session }
        );
      }
    }

    await Order.findByIdAndDelete(req.params.id).session(session);
    
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Delete order error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ADDED: Get single order endpoint
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({
        path: 'clientId',
        select: 'fullName email number fiscalNumber'
      })
      .populate({
        path: 'products.productId',
        select: 'name price'
      });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get single order error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ADDED: Order statistics endpoint
app.get('/api/orders/stats/summary', authenticateToken, async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      statusBreakdown: stats
    });
  } catch (error) {
    console.error('Get order stats error:', error.message);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Error handling middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});