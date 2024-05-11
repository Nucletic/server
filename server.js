const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const routes = require('./routes/route');
const essentials = require('./essentials');
const admin = require('./firebaseAdminSDK');
const http = require('http');
const WebSocket = require('ws');

require('dotenv-safe').config();

const { SECRET_KEY } = process.env;
const AUTH = admin.auth();
const DB = admin.firestore();
const STORAGE = admin.storage();

const userConnections = new Map();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


const PORT = process.env.PORT || 5000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

app.use('/', routes); app.listen(PORT, () => {
  console.log('Server is listening on Port:', PORT);
});

server.listen(process.env.PORT, () => {
  console.log('websocket server started on port 8000');
});



// WebSocket Code
wss.on('connection', async (ws, req) => {
  let userId;
  console.log('connected')

  ws.on('message', async (message) => {
    const { userId: messageUserId, idToken, activityStatus, recipientId, type, offer, answer, candidate, replyMessage, LikerUUID, TaleOwnerUUID } = JSON.parse(message);

    try {
      const decryptedIdToken = essentials.decryptData(idToken, SECRET_KEY);
      const decodedToken = await AUTH.verifyIdToken(decryptedIdToken);
      if (decodedToken.uid) {
        userConnections.set(messageUserId, ws);
        userId = messageUserId;
      } else {
        ws.send('Unauthorized');
        return;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send('Unauthorized');
      return;
    }

    switch (type) {
      case 'activityStatus':
        updateActivityStatus(ws, activityStatus, messageUserId);
        break;
      case 'answer':
        handleAnswer(ws, recipientId, answer, messageUserId);
        break;
      case 'candidate':
        handleCandidate(ws, recipientId, candidate);
        break;
      case 'offer':
        handleOffer(ws, offer);
        break;
      case 'TaleReply':
        TaleReply(ws, replyMessage);
        break;
      case 'likedtale':
        UpdateLikedBy(ws, LikerUUID, TaleOwnerUUID);
        break;
      default:
        console.log('Unknown message type:', type);
    }
  });

  ws.on('close', () => {
    if (userId) {
      updateActivityStatus(ws, 'inactive', userId);
      userConnections.delete(userId);
    }
  });

});

// WebSocket Operations Code

const updateActivityStatus = async (ws, activityStatus, messageUserId) => {
  try {
    const querySnapshot = await DB.collection('users').where('userId', '==', messageUserId).get();

    if (!querySnapshot.empty) {
      await querySnapshot.docs[0].ref.update({
        activityStatus: activityStatus,
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      });
      ws.send('updated Activity Status');
    }
    ws.send('User Not Found');

  } catch (error) {
    console.error('Error sending answer:', error);
    ws.send('Error updating Activity Status');
  }
}


const handleAnswer = async (ws, recipientId, answer, messageUserId) => {
  try {
    console.log('sending back the answer to offer owner', recipientId);
    if (recipientId) {
      const connection = userConnections.get(recipientId);
      if (connection) {
        connection.send(JSON.stringify({ type: 'answer', answer: answer, userId: messageUserId }));
      }
    }
  } catch (error) {
    console.error('Error sending answer:', error);
    ws.send('Error sending answer');
  }
}

const handleCandidate = async (ws, recipientId, candidate) => {
  try {
    console.log('CANDIDATE, SENT TO', recipientId);
    if (recipientId && candidate) {
      const recipientConnection = userConnections.get(recipientId);
      if (recipientConnection) {
        recipientConnection.send(JSON.stringify({ type: 'candidate', candidate: candidate }));
      }
    }
  } catch (error) {
    console.error('Error sending candidate:', error);
    ws.send('Error sending candidate');
  }
}

const handleOffer = async (ws, offer) => {
  try {
    console.log('first')
    const decryptedOffer = essentials.decryptData(offer, SECRET_KEY);
    const docRef = await DB.collection('calls').add(JSON.parse(decryptedOffer));
    const recipientUserId = JSON.parse(decryptedOffer).recipientId;
    const notification = {
      type: 'incoming_call',
      docId: docRef.id,
      offer: offer,
    };
    sendCallNotification(recipientUserId, notification);
  } catch (error) {
    console.error('Error handling offer:', error);
    ws.send('Error Creating Offer');
  }
}

function sendCallNotification(recipientUserId, notification) {
  const connection = userConnections.get(recipientUserId);
  if (connection) {
    connection.send(JSON.stringify(notification));
  }
}

const TaleReply = async (ws, replyMessage) => {
  try {
    const { senderId, receiverId } = replyMessage;

    const chatDocId1 = `${senderId}_${receiverId}`;
    const chatDocId2 = `${receiverId}_${senderId}`;

    let chatRef = DB.collection('chats').doc(chatDocId1);
    let chatSnapshot = await chatRef.get();

    if (!chatSnapshot.exists) {
      chatRef = DB.collection('chats').doc(chatDocId2);
      chatSnapshot = await chatRef.get();

      if (!chatSnapshot.exists) {
        await chatRef.set({
          chatId: chatDocId1,
          participants: [senderId, receiverId],
          unreadCount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMessage: replyMessage, // Update lastMessage field
        });
      }
    }

    // Now update the messages subcollection
    const messagesRef = chatRef.collection('messages');
    await messagesRef.add(replyMessage); // Add the replyMessage to the messages subcollection

    // Update the lastMessage field in the chat document
    await chatRef.update({ lastMessage: replyMessage });

    ws.send(JSON.stringify({ message: 'Replied to Tale Successfully' }));
  } catch (error) {
    console.error('Error handling offer:', error);
    ws.send('Error Replying to the Tale');
  }
}


const UpdateLikedBy = async (ws, LikerUUID, TaleOwnerUUID) => {
  try {

    const userQuerySnapshot = await DB.collection('users').where('userId', '==', TaleOwnerUUID).get();
    const likerQuerySnapshot = await DB.collection('users').where('userId', '==', LikerUUID).get();
    const batch = DB.batch();

    userQuerySnapshot.forEach(userDoc => {
      const userData = userDoc.data();
      const likerData = likerQuerySnapshot.docs[0].data();
      const updatedTale = userData.tale.map(tale => {
        if (!tale.likedBy || !tale.likedBy.includes(LikerUUID)) {
          return {
            ...tale,
            likedBy: [...(tale.likedBy || []), {
              profileImage: likerData.profileImage,
              username: likerData.username,
              userId: LikerUUID,
              timestamp: new Date(),
            }],
          };
        } else {
          return tale;
        }
      });

      const userRef = DB.collection('users').doc(userDoc.id);
      batch.update(userRef, { tale: updatedTale });
    });

    await batch.commit();

    ws.send(JSON.stringify({ message: 'Liked Tale Successfully' }));

  } catch (error) {
    console.error('Error handling offer:', error);
    ws.send('Error Replying to the Tale');
  }
}
