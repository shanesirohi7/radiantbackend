require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  school: String,
  profilePic: String, // Profile picture URL (uploaded to Cloudinary)
  class: String,      // New field (6th - 12th)
  section: String,    // New field (A - J)
  interests: [String],// New field (Array of interests)
  instagramUsername: String, // New field
});

const User = mongoose.model('User', UserSchema);

// Post Schema
const PostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  image: String,
  createdAt: { type: Date, default: Date.now },
});

const Post = mongoose.model('Post', PostSchema);

// Signup Route
app.post('/signup', async (req, res) => {
  const { name, email, password, school } = req.body;
  if (!name || !email || !password || !school) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user without profile setup details
    const user = new User({ name, email, password: hashedPassword, school });
    await user.save();

    res.status(201).json({ message: 'Signup successful', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/setupProfile', async (req, res) => {
  const { token } = req.headers;
  const { profilePic, class: userClass, section, interests, instagramUsername } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Update user profile with new fields
    user.profilePic = profilePic;
    user.class = userClass;
    user.section = section;
    user.interests = interests;
    user.instagramUsername = instagramUsername;
    await user.save();

    res.json({ message: 'Profile setup complete', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields are required' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ 
      token, 
      user: {
        name: user.name, email: user.email, school: user.school, 
        profilePic: user.profilePic, class: user.class, section: user.section,
        interests: user.interests, instagramUsername: user.instagramUsername
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

  
app.get('/profile', async (req, res) => {
  const { token } = req.headers;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});


// Create Post
app.post('/createPost', async (req, res) => {
  const { token } = req.headers;
  const { content, image } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!content) return res.status(400).json({ error: 'Content is required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    const newPost = new Post({ user: user._id, content, image });
    await newPost.save();
    res.status(201).json({ message: 'Post created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Fetch Posts
app.get('/posts', async (req, res) => {
  try {
    const posts = await Post.find().populate('user', 'name profilePic').sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
