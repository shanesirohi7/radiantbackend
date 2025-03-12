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
    online: { type: Boolean, default: false },
});
const onlineUsers = {};
const User = mongoose.model('User', UserSchema);

//VERY RISKY CODE HERE
app.get('/searchUsers', async (req, res) => {
  const { query, school, class: userClass, section, interests } = req.query;
  const { token } = req.headers;

  if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      let filters = { _id: { $ne: userId } }; // Exclude the user who is searching

      if (query) {
          filters.$or = [
              { name: { $regex: query, $options: 'i' } },
              { school: { $regex: query, $options: 'i' } },
              { class: { $regex: query, $options: 'i' } },
              { section: { $regex: query, $options: 'i' } },
          ];
      }

      if (school) {
          filters.school = { $regex: school, $options: 'i' };
      }

      if (userClass) {
          filters.class = { $regex: userClass, $options: 'i' };
      }

      if (section) {
          filters.section = { $regex: section, $options: 'i' };
      }

      if (interests) {
          filters.interests = { $in: interests.split(',') }; // Assuming interests are comma-separated
      }

      const users = await User.find(filters).select('name profilePic class section school interests');

      res.json(users);
  } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/otherProfile/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
  }

  try {
      // Validate userId format (optional but recommended)
      if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ error: 'Invalid User ID format' });
      }

      const user = await User.findById(userId).select('-password');

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      // Populate only 'friends' (no need for 'friendRequests' here)
      await user.populate('friends', 'name profilePic');

      res.json(user); // Directly send the user object
  } catch (err) {
      console.error('Error fetching other profile:', err);
      if (err.name === 'CastError') {
          return res.status(400).json({ error: 'Invalid User ID' });
      }
      res.status(500).json({ error: 'Server error' });
  }
});

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
const MemorySchema = new mongoose.Schema({
  title: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  taggedFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  photos: { type: [String], default: [] }
});
const Memory = mongoose.model('Memory', MemorySchema);

app.post('/uploadMemory', async (req, res) => {
  const { token } = req.headers;
  const { title, taggedFriends } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const memory = new Memory({
          title: title,
          author: userId,
          taggedFriends: taggedFriends ? taggedFriends.split(',') : [],
      });

      await memory.save();

      res.json({ message: 'Memory uploaded successfully', memory });
  } catch (err) {
      console.error('Memory upload error:', err);
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
      const userId = decoded.userId;

      const user = await User.findById(userId).select('-password');

      if (!user) return res.status(404).json({ error: 'User not found' });

      const memoryCount = await Memory.countDocuments({ author: userId });

      // Fetch created memories
      const createdMemories = await Memory.find({ author: userId })
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

      // Fetch tagged memories
      const taggedMemories = await Memory.find({ taggedFriends: userId })
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

      res.json({ ...user.toObject(), memoryCount, createdMemories, taggedMemories });
  } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
  }
});
app.get('/memory/:memoryId', async (req, res) => {
  const { memoryId } = req.params;

  if (!memoryId) return res.status(400).json({ error: 'Memory ID is required' });

  try {
      const memory = await Memory.findById(memoryId)
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

      if (!memory) return res.status(404).json({ error: 'Memory not found' });

      res.json(memory);
  } catch (err) {
      console.error('Error fetching memory:', err);
      res.status(500).json({ error: 'Server error' });
  }
});
app.get('/memories', async (req, res) => {
  const { token } = req.headers;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const friends = user.friends;
    friends.push(userId);

    const userMemories = await Memory.find({ author: userId })
      .populate('author', 'name profilePic')
      .populate('taggedFriends', 'name profilePic');

    const friendsMemories = await Memory.find({ author: { $in: friends } })
      .populate('author', 'name profilePic')
      .populate('taggedFriends', 'name profilePic');

    const otherMemories = await Memory.find({ author: { $nin: friends } })
      .populate('author', 'name profilePic')
      .populate('taggedFriends', 'name profilePic');

    const allMemories = [...userMemories, ...friendsMemories, ...otherMemories];
    allMemories.sort((a, b) => b.createdAt - a.createdAt);

    // Send the first 10 memories
    res.json(allMemories.slice(0, 10)); // send the first 10

  } catch (err) {
    console.error('Error fetching memories:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/memories/more/:offset', async (req, res) => {
    const { token } = req.headers;
    const { offset } = req.params;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const friends = user.friends;
        friends.push(userId);

        const userMemories = await Memory.find({ author: userId })
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

        const friendsMemories = await Memory.find({ author: { $in: friends } })
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

        const otherMemories = await Memory.find({ author: { $nin: friends } })
          .populate('author', 'name profilePic')
          .populate('taggedFriends', 'name profilePic');

        const allMemories = [...userMemories, ...friendsMemories, ...otherMemories];
        allMemories.sort((a, b) => b.createdAt - a.createdAt);

        const offsetNumber = parseInt(offset, 10);
        res.json(allMemories.slice(offsetNumber, offsetNumber + 10)); //send the next 10

    } catch (err) {
        console.error('Error fetching memories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/memory/:memoryId/addPhoto', async (req, res) => {
  const { token } = req.headers;
  const { photoUrl } = req.body;
  const { memoryId } = req.params;

  console.log('Token:', token);
  console.log('Memory ID:', memoryId);
  console.log('Photo URL:', photoUrl);

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!photoUrl) return res.status(400).json({ error: 'Photo URL is required' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      console.log('Decoded User ID:', userId);

      console.log('Finding Memory...');
      const memory = await Memory.findById(memoryId);
      if (!memory) {
          console.log('Memory not found!');
          return res.status(404).json({ error: 'Memory not found' });
      }
      console.log('Memory found:', memory);

      console.log('User ID:', userId);
      console.log('Memory Author:', memory.author.toString());
      console.log('Tagged Friends:', memory.taggedFriends);

      if (memory.author.toString() !== userId && !memory.taggedFriends.includes(userId)) {
          console.log('Unauthorized!');
          return res.status(403).json({ error: 'Unauthorized to add photos' });
      }

      memory.photos.push(photoUrl);
      console.log('Saving Memory...');
      await memory.save();
      console.log('Memory saved successfully!');

      res.json({ message: 'Photo added successfully', memory });
  } catch (err) {
      console.error('Add photo error:', err);
      console.error('Stack Trace:', err.stack);
      res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/api/onlineFriends', async (req, res) => {
  const { token } = req.headers;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const user = await User.findById(userId).populate('friends', 'name profilePic online');

      if (!user) return res.status(404).json({ error: 'User not found' });

      const onlineFriends = user.friends.filter(friend => friend.online); //filter friends who are online.

      res.json(onlineFriends);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});


io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId; // Get userId from query

  if (userId) {
    onlineUsers[userId] = socket.id;
    console.log(`User ${userId} connected`);
    User.findByIdAndUpdate(userId, { online: true }).exec(); //set online to true in database.
  }
    console.log('A user connected:', socket.id);

  socket.on('message', (data) => {
    console.log('Message received:', data);
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    if (userId) {
      delete onlineUsers[userId];
      console.log(`User ${userId} disconnected`);
      User.findByIdAndUpdate(userId, { online: false }).exec(); //set online to false in database.
    }
      console.log('A user disconnected:', socket.id);
  });
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
