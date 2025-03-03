require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const PORT = process.env.PORT || 5000;


app.use(express.json());
app.use(cors());

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

  const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    school: String,
    profilePic: String,
    class: String,
    section: String,
    interests: [String],
    instagramUsername: String,
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const User = mongoose.model('User', UserSchema);

//VERY RISKY CODE HERE
app.post('/sendFriendRequest', async (req, res) => {
  const { token } = req.headers;
  const { friendId } = req.body;

  if (!token || !friendId) return res.status(400).json({ error: 'Missing parameters' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      if (userId === friendId) return res.status(400).json({ error: 'Cannot send request to yourself' });

      const user = await User.findById(userId);
      const friend = await User.findById(friendId);

      if (!user || !friend) return res.status(404).json({ error: 'User not found' });

      if (friend.friendRequests.includes(userId)) return res.status(400).json({ error: 'Friend request already sent' });
      if (user.friends.includes(friendId)) return res.status(400).json({error: 'already friends'});

      friend.friendRequests.push(userId);
      await friend.save();

      res.json({ message: 'Friend request sent successfully' });
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.post('/acceptFriendRequest', async (req, res) => {
  const { token } = req.headers;
  const { friendId } = req.body;

  if (!token || !friendId) return res.status(400).json({ error: 'Missing parameters' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId);
      const friend = await User.findById(friendId);

      if (!user || !friend) return res.status(404).json({ error: 'User not found' });

      if (!user.friendRequests.includes(friendId)) return res.status(400).json({ error: 'No friend request from this user' });

      user.friendRequests.pull(friendId);
      user.friends.push(friendId);
      friend.friends.push(userId);

      await user.save();
      await friend.save();

      res.json({ message: 'Friend request accepted' });
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.post('/rejectFriendRequest', async (req, res) => {
  const { token } = req.headers;
  const { friendId } = req.body;

  if (!token || !friendId) return res.status(400).json({ error: 'Missing parameters' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId);

      if (!user) return res.status(404).json({ error: 'User not found' });

      if (!user.friendRequests.includes(friendId)) return res.status(400).json({ error: 'No friend request from this user' });

      user.friendRequests.pull(friendId);
      await user.save();

      res.json({ message: 'Friend request rejected' });
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/getFriends', async (req, res) => {
  const { token } = req.headers;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId).populate('friends', 'name profilePic');

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json(user.friends);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/getFriendRequests', async (req, res) => {
  const { token } = req.headers;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId).populate('friendRequests', 'name profilePic');

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json(user.friendRequests);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/recommendUsers', async (req, res) => {
  const { token } = req.headers;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId);

      if (!user) return res.status(404).json({ error: 'User not found' });

      const sameClass = await User.find({ class: user.class, _id: { $ne: userId } })
          .select('name profilePic class section interests');

      const sameSchool = await User.find({ school: user.school, _id: { $ne: userId } })
          .select('name profilePic class section interests');

      const sameInterests = await User.find({ interests: { $in: user.interests }, _id: { $ne: userId } })
          .select('name profilePic class section interests');

      // Simple weighted algorithm (adjust weights as needed)
      const recommendations = [];
      const seen = new Set();

      sameClass.forEach(u => {
          if (!seen.has(u._id.toString())) {
              recommendations.push({ ...u.toObject(), weight: 3 });
              seen.add(u._id.toString());
          }
      });

      sameSchool.forEach(u => {
          if (!seen.has(u._id.toString())) {
              recommendations.push({ ...u.toObject(), weight: 2 });
              seen.add(u._id.toString());
          }
      });

      sameInterests.forEach(u => {
          if (!seen.has(u._id.toString())) {
              recommendations.push({ ...u.toObject(), weight: 1 });
              seen.add(u._id.toString());
          }
      });

      // Sort by weight (highest first)
      recommendations.sort((a, b) => b.weight - a.weight);

      res.json(recommendations);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/userDetails/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
      const user = await User.findById(userId).select('-password');

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json(user);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});
//RISKY CODE OVER


app.post('/signup', async (req, res) => {
  const { name, email, password, school } = req.body;
  if (!name || !email || !password || !school) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, school });
    await user.save();

    // JWT Generation
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ message: 'Signup successful', token, userId: user._id });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/profile', async (req, res) => {
  const { token } = req.headers;
  const { profilePic, class: userClass, section, interests, instagramUsername } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

  
    user.profilePic = profilePic;
    user.class = userClass;
    user.section = section;
    user.interests = interests;
    user.instagramUsername = instagramUsername;
    await user.save();

    res.json({ message: 'Profile updated successfully', user });
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





io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('message', (data) => {
    console.log('Message received:', data);
    io.emit('message', data); 
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
