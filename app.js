//ALL IMPORTS
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const http = require('http');
const { Server } = require('socket.io');




//SETUP
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
const onlineUsers = {};





//SCHEMAS
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
  // New fields
  bio: { type: String, default: '' }, // Optional bio with default empty string
  coverPhoto: { type: String, default: '' }, // Optional cover photo URL with default empty string
  relationshipStatus: { 
      type: String, 
      enum: ['Single', 'In a relationship', 'Married', 'Complicated', ''], // Controlled options, including empty
      default: '' 
  },
});
const User = mongoose.model('User', UserSchema);

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
});
const Conversation = mongoose.model('Conversation', ConversationSchema);

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  createdAt: { type: Date, default: Date.now },
  // New fields for delivery and read status
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});
const Message = mongoose.model('Message', MessageSchema);

const MemorySchema = new mongoose.Schema({
  title: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  taggedFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  photos: { type: [String], default: [] },
  timelineEvents: {
    type: [{
      date: { type: Date, required: true },
      time: { type: String, required: true },
      eventText: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    default: [] // Add this to make the array optional
  },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
});
const Memory = mongoose.model('Memory', MemorySchema);




//USERS ROUTES
app.put('/editprofile', async (req, res) => {
  const { token } = req.headers;
  const { 
    profilePic, 
    class: userClass, 
    section, 
    interests, 
    instagramUsername, 
    bio, 
    coverPhoto, 
    relationshipStatus 
  } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update only the fields that are provided in the request
    if (profilePic !== undefined) user.profilePic = profilePic;
    if (userClass !== undefined) user.class = userClass;
    if (section !== undefined) user.section = section;
    if (interests !== undefined) user.interests = interests;
    if (instagramUsername !== undefined) user.instagramUsername = instagramUsername;
    if (bio !== undefined) user.bio = bio;
    if (coverPhoto !== undefined) user.coverPhoto = coverPhoto;
    if (relationshipStatus !== undefined) user.relationshipStatus = relationshipStatus;

    await user.save();

    // Return the updated user without the password
    const updatedUser = await User.findById(userId).select('-password');
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Edit profile error:', err);
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





//Friend requests
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





//FRIENDS
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






// Chatting
app.post('/messages/markAsRead', async (req, res) => {
  const { messageIds } = req.body;
  const { token } = req.headers;

  if (!token || !messageIds || !Array.isArray(messageIds)) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Only mark messages as read if they were SENT BY THE OTHER USER
    const messages = await Message.find({ _id: { $in: messageIds } });

    const messagesToUpdate = messages.filter(
      (msg) => msg.senderId.toString() !== userId
    );

    if (messagesToUpdate.length > 0) {
      await Message.updateMany(
        { _id: { $in: messagesToUpdate.map((msg) => msg._id) } },
        { $addToSet: { readBy: userId } }
      );

      res.json({ success: true, updatedMessages: messagesToUpdate.length });
    } else {
      res.json({ success: false, message: "No messages needed to be marked as read" });
    }
  } catch (err) {
    console.error('Error marking messages as read:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/conversations', async (req, res) => {
  const { token } = req.headers;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const conversations = await Conversation.find({ participants: userId })
          .populate('participants', 'name profilePic');

      res.json(conversations);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});

app.post('/conversations', async (req, res) => {
  const { token } = req.headers;
  const { participantIds } = req.body;

  if (!token || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      if (!participantIds.includes(userId)) {
          participantIds.push(userId);
      }
      //Validation checks.
      if (participantIds.length < 2){
          return res.status(400).json({error: "Not enough participants"})
      }

      const conversation = new Conversation({ participants: participantIds });
      await conversation.save();

      res.json(conversation);
  } catch (err) {
      console.error('Conversations error:', err);
      res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
app.get('/messages/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const { token } = req.headers;

  if (!token || !conversationId) {
      return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // Verify the user is a participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(userId)) {
          return res.status(403).json({ error: 'Unauthorized' });
      }

      const messages = await Message.find({ conversationId })
          .populate('senderId', 'name profilePic')
          .sort({ createdAt: 1 });

      res.json(messages);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});

// Send a new message
app.post('/messages/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const { content } = req.body;
  const { token } = req.headers;

  if (!token || !conversationId || !content) {
      return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(userId)) {
          return res.status(403).json({ error: 'Unauthorized' });
      }

      const message = new Message({ conversationId, senderId: userId, content });
      await message.save();

      // Emit the new message via Socket.IO
      io.to(conversationId.toString()).emit('new_message', {
          ...message.toObject(),
          senderId: { _id: userId }, // Populate senderId on the frontend as needed
      });

      res.json(message);
  } catch (err) {
      res.status(500).json({ error: 'Server error' });
  }
});






//MEMORIES
app.post('/memory/:memoryId/addTimelineEvent', async (req, res) => {
  const { token } = req.headers;
  const { memoryId } = req.params;
  const { date, time, eventText } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!date || !time || !eventText) {
    return res.status(400).json({ error: 'All timeline event fields are required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const memory = await Memory.findById(memoryId);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    
    if (memory.author.toString() !== userId && !memory.taggedFriends.includes(userId)) {
      return res.status(403).json({ error: 'Unauthorized to add timeline events' });
    }

    memory.timelineEvents.push({ date, time, eventText });
    await memory.save();
    
    // Populate fields sequentially
    await memory.populate('author', 'name profilePic');
    await memory.populate('taggedFriends', 'name profilePic');
    await memory.populate('likes', 'name profilePic');
    await memory.populate('comments.author', 'name profilePic');

    res.json({ message: 'Timeline event added successfully', memory });
  } catch (err) {
    console.error('Add timeline event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Like a memory
app.post('/memory/:memoryId/like', async (req, res) => {
  const { token } = req.headers;
  const { memoryId } = req.params;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const memory = await Memory.findById(memoryId);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });

    if (memory.likes.includes(userId)) {
      memory.likes.pull(userId);
    } else {
      memory.likes.push(userId);
    }

    await memory.save();
    await memory.populate('likes', 'name profilePic');

    res.json({ message: 'Like updated successfully', likes: memory.likes });
  } catch (err) {
    console.error('Like memory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add comment to memory
app.post('/memory/:memoryId/comment', async (req, res) => {
  const { token } = req.headers;
  const { memoryId } = req.params;
  const { content } = req.body;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!content) return res.status(400).json({ error: 'Comment content is required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const memory = await Memory.findById(memoryId);
    if (!memory) return res.status(404).json({ error: 'Memory not found' });

    memory.comments.push({
      author: userId,
      content
    });

    await memory.save();
    await memory.populate('comments.author', 'name profilePic');

    res.json({ 
      message: 'Comment added successfully', 
      comments: memory.comments 
    });
  } catch (err) {
    console.error('Add comment error:', err);
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

app.get('/memory/:memoryId', async (req, res) => {
  const { memoryId } = req.params;

  if (!memoryId) return res.status(400).json({ error: 'Memory ID is required' });

  try {
    const memory = await Memory.findById(memoryId)
      .populate('author', 'name profilePic')
      .populate('taggedFriends', 'name profilePic')
      .populate('likes', 'name profilePic')
      .populate('comments.author', 'name profilePic');

    if (!memory) return res.status(404).json({ error: 'Memory not found' });

    res.json(memory);
  } catch (err) {
    console.error('Error fetching memory:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.get('/friendsMemories', async (req, res) => {
  const { token } = req.headers;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findById(userId).populate('friends');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const friendIds = user.friends.map(friend => friend._id);

    const friendsMemories = await Memory.find({
      $or: [
        { author: { $in: friendIds } },
        { taggedFriends: { $elemMatch: { $in: friendIds } } },
      ],
    })
      .populate('author taggedFriends')
      .sort({ createdAt: -1 });

    res.json(friendsMemories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/userMemories/:userId', async (req, res) => {
  const { userId } = req.params;
  const { token } = req.headers;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const memories = await Memory.find({
      $or: [
        { author: userId },
        { taggedFriends: userId }
      ]
    })
    .populate('author taggedFriends')
    .sort({ createdAt: -1 });
    res.json(memories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/uploadMemory', async (req, res) => {
  const { token } = req.headers;
  const { title, taggedFriends, timelineEvents } = req.body; // Destructure timelineEvents

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const friendIds = taggedFriends ? taggedFriends.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)) : [];
      const memory = new Memory({
          title: title,
          author: userId,
          taggedFriends: friendIds,
          timelineEvents: timelineEvents || [] // Use the sent value, default to empty array
      });

      await memory.save();
      res.json({ message: 'Memory uploaded successfully', memory });
  } catch (err) {
      console.error('Memory upload error:', err.message, err.stack);
      res.status(500).json({ error: 'Server error', details: err.message });
  }
});



//AUTH
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

  










//OTHERS
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




//IO ROUTES
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
      onlineUsers[userId] = socket.id;
      console.log(`User ${userId} connected`);
      User.findByIdAndUpdate(userId, { online: true }).exec();
  }

  socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
      console.log(`User ${userId} joined conversation: ${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`User ${userId} left conversation: ${conversationId}`);
  });

  socket.on('disconnect', () => {
      if (userId) {
          delete onlineUsers[userId];
          console.log(`User ${userId} disconnected`);
          User.findByIdAndUpdate(userId, { online: false }).exec();
      }
      console.log('A user disconnected:', socket.id);
  });
});
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  // Keep your existing socket event handlers
  
  // Add these new handlers
  socket.on('message_delivered', async ({ messageId, userId, conversationId }) => {
    try {
      // Update the message in the database
      await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { deliveredTo: userId } }
      );
      
      // Notify other users in the conversation
      socket.to(conversationId).emit('message_delivered_update', {
        messageId,
        deliveredTo: [userId]
      });
    } catch (err) {
      console.error('Error updating message delivery status:', err);
    }
  });

  socket.on('messages_read', async ({ conversationId, messageIds, readBy }) => {
    try {
      // Notify other users in the conversation
      socket.to(conversationId).emit('message_read_update', {
        messageIds,
        readBy: [readBy]
      });
    } catch (err) {
      console.error('Error broadcasting read status:', err);
    }
  });
  
  socket.on('typing_indicator', ({ conversationId, userId, isTyping }) => {
    socket.to(conversationId).emit('typing_indicator', { userId, isTyping });
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
