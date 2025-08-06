const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // Optional: hash the password

mongoose.connect('mongodb+srv://user:user@cluster0.wngeshx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => console.log('Connected'))
  .catch(err => console.error('Connection error:', err));

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

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('admin', 10); // optional
  const admin = new User({
    name: 'Admin',
    surname: 'User',
    email: 'admin@admin.com',
    password: hashedPassword, // or plain if not hashed
    role: 'admin',
  });

  try {
    await admin.save();
    console.log('Admin created');
  } catch (err) {
    console.error('Error creating admin:', err);
  } finally {
    mongoose.disconnect();
  }
}

createAdmin();