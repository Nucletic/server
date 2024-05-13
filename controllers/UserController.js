const essentials = require('../essentials');
const admin = require('../firebaseAdminSDK');
const nodemailer = require('nodemailer');
const { roles } = require('../roles');
const uuid = require('uuid');
const WebSocket = require('ws');
const { recommendUsers } = require('../UserRecommendationSystem');
const { arrayUnion, arrayRemove } = require('firebase/firestore');
const wss = new WebSocket.Server({ port: 8080 });

const MailConfig = {
  smtp: {
    host: 'yatiglobalsolutions.com',
    port: 465,
    secure: true,
    auth: {
      user: 'capsule@yatiglobalsolutions.com',
      pass: 'Priyanshu@_1234',
    },
  },
  from: 'capsule@yatiglobalsolutions.com',
};



require('dotenv-safe').config();

const { SECRET_KEY } = process.env;
const AUTH = admin.auth();
const DB = admin.firestore();
const STORAGE = admin.storage();
const BUCKET = admin.storage().bucket();

exports.grantAccess = function (action, resource) {
  return async (req, res, next) => {
    try {
      const permission = roles.can('user')[action](resource);
      if (!permission.granted) {
        return res.status(401).json({
          error: "You don't have enough permission to perform this action"
        });
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

exports.register = async (req, res, next) => {
  try {
    const { name, username, email, password } = req.body;

    console.log('asdfasdf')
    const decryptedEmail = essentials.decryptData(email, SECRET_KEY);
    const decryptedPassword = essentials.decryptData(password, SECRET_KEY);

    const userId = uuid.v4();

    const userRecord = await AUTH.createUser({
      email: decryptedEmail,
      password: decryptedPassword,
    });

    await AUTH.setCustomUserClaims(userRecord.uid, { CustomUUID: userId });

    const updateUser = await AUTH.updateUser(userRecord.uid, {
      displayName: name,
    });

    const CustomToken = await AUTH.createCustomToken(userRecord.uid);
    const encryptedCustomToken = essentials.encryptData(CustomToken, SECRET_KEY);

    const userRef = DB.collection('users');

    const querySnapshot = await userRef.where('username', '==', username).get();

    if (querySnapshot.empty) {

      const userDoc = userRef.doc(userRecord.uid);
      await userDoc.set({
        userId: userId,
        name: name,
        username: username,
        email: email,
        activityStatus: 'inactive',
        privateAccount: false,
        Location: true,
        blockedUsers: [],
        mutedUsers: [],
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const verificationLink = await AUTH.generateEmailVerificationLink(decryptedEmail);

      const emailContent = `
      Please verify your email address by clicking the following link:
      ${verificationLink}
      `;

      const transporter = nodemailer.createTransport(MailConfig.smtp);
      const mailOptions = {
        from: MailConfig.from,
        to: decryptedEmail,
        subject: 'Email Verification Required',
        text: emailContent,
      };

      await transporter.sendMail(mailOptions);

      return res.status(200).json({
        message: 'userCreated',
        CustomToken: encryptedCustomToken,
        CustomUUID: userId,
      });

    } else if (!querySnapshot.empty) {
      return res.status(200).json({
        message: 'duplicateUsername',
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.resendVerificationEmail = async (req, res, next) => {
  try {
    const user = req.user;
    const verificationLink = await AUTH.generateEmailVerificationLink(user.email);

    const emailContent = `
      Please verify your email address by clicking the following link:
      ${verificationLink}
    `;

    const transporter = nodemailer.createTransport(MailConfig.smtp);

    const mailOptions = {
      from: MailConfig.from,
      to: user.email,
      subject: 'Email Verification Required',
      text: emailContent,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      emailSent: true
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.sendPasswordResetEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    const decryptedEmail = essentials.decryptData(email, SECRET_KEY);
    const PasswordResetLink = await AUTH.generatePasswordResetLink(decryptedEmail);

    const emailContent = `
    Please reset your password by clicking the following link:
    ${PasswordResetLink}
    `;

    const transporter = nodemailer.createTransport(MailConfig.smtp);

    const mailOptions = {
      from: MailConfig.from,
      to: decryptedEmail,
      subject: 'Reset Your Password',
      text: emailContent,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      emailSent: true
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.verifyToken = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization.split(' ')[1];
    const decryptedToken = essentials.decryptData(idToken, SECRET_KEY);
    const decodedToken = await AUTH.verifyIdToken(decryptedToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying ID Token:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const { bio, Interests } = req.body;

    let bannerImage = null;
    let profileImage = null;
    for (let i = 0; i < req.files.length; i++) {
      if (req.files[i].originalname === 'profileImage.jpeg') {
        profileImage = req.files[i];
      } else if (req.files[i].originalname === 'bannerImage.jpeg') {
        bannerImage = req.files[i];
      }
    }

    const bannerUrl = await uploadUserImage(bannerImage, user.uid);
    const profileUrl = await uploadUserImage(profileImage, user.uid);

    const updateFields = {};
    updateFields.bio = bio;
    updateFields.interests = JSON.parse(Interests);
    updateFields.bannerImage = bannerUrl;
    updateFields.profileImage = profileUrl;

    await DB.collection('users').doc(user.uid).update(updateFields);

    return res.status(200).json({
      userUpdated: true,
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.getOwnProfile = async (req, res, next) => {
  try {
    const user = req.user;

    const querySnapshot = await DB.collection('users').doc(user.uid).get();

    if (querySnapshot.empty) {
      return res.status(401).json({
        user: null,
      })
    }

    if (!querySnapshot.exists) {
      return res.status(401).json({
        user: null,
      });
    }

    const userDocument = querySnapshot.data();
    return res.status(200).json({
      user: userDocument,
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.getUserProfile = async (req, res, next) => {
  try {
    const CustomUUID = req.params.userId;

    const usersCollection = DB.collection('users');
    const querySnapshot = await usersCollection.where('userId', '==', CustomUUID).get();

    if (querySnapshot.empty) {
      return res.status(404).json({
        user: null,
      });
    }

    const userData = querySnapshot.docs[0].data();
    return res.status(200).json({
      user: userData,
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.editProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const { bio, Interests, username, name } = req.body;

    let bannerImage;
    let profileImage;
    for (let i = 0; i < req.files.length; i++) {
      if (req.files[i].originalname === 'profileImage.jpeg') {
        profileImage = req.files[i];
      } else if (req.files[i].originalname === 'bannerImage.jpeg') {
        bannerImage = req.files[i];
      }
    }

    const bannerUrl = await uploadUserImage(bannerImage, user.uid);
    const profileUrl = await uploadUserImage(profileImage, user.uid);

    const updateFields = {};
    if (name) updateFields.name = name;
    if (username) {
      updateFields.username = username;
      updateFields.lastUsernameUpdate = new Date();
    }
    if (bio) updateFields.bio = bio;
    if (Interests) updateFields.interests = JSON.parse(Interests);
    if (bannerUrl) updateFields.bannerImage = bannerUrl;
    if (profileUrl) updateFields.profileImage = profileUrl;

    const querySnapshot = await DB.collection('users').where('username', '==', username).get();

    if (querySnapshot.empty) {

      await DB.collection('users').doc(user.uid).update(updateFields);

      await AUTH.updateUser(user.uid, {
        displayName: name,
      });

      return res.status(200).json({
        message: 'userUpdated',
        userUpdated: true,
      })
    } else {

      return res.status(200).json({
        message: 'duplicateUsername',
        userUpdated: true,
      })

    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

const uploadUserImage = async (image, uid) => {
  if (!image) return null;

  const Name = uuid.v4();
  const Buffer = image.buffer;

  const Path = `${uid, '_Images'}/${Name}.jpg`;
  await BUCKET.file(Path).save(Buffer, {
    metadata: {
      contentType: 'image/jpeg',
    },
  });

  const [url] = await BUCKET.file(Path).getSignedUrl({
    action: 'read',
    expires: '01-01-3000'
  });
  return url;
}

exports.requestEmailChange = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = req.user;


    const actionCodeSettings = {

      // This must be true for email link sign-in.
      handleCodeInApp: true,
      android: {
        packageName: 'com.nucletic.time',
        installApp: true,
        minimumVersion: '12',
      },
    };




    const updatedUser = await AUTH.getUser(user.uid);

    const decryptedEmail = essentials.decryptData(email, SECRET_KEY);

    const verificationLink = await AUTH.generateVerifyAndChangeEmailLink(updatedUser.email, decryptedEmail, actionCodeSettings);

    const emailContent = `Please verify your email address by clicking the following link to change your email:
      ${verificationLink}`;

    const transporter = nodemailer.createTransport(MailConfig.smtp);

    const mailOptions = {
      from: MailConfig.from,
      to: decryptedEmail,
      subject: 'Email Verification Required',
      text: emailContent,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      emailSent: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.enableLocation = async (req, res, next) => {
  try {
    const userUID = req.user.uid;

    const userRef = DB.collection('users').doc(userUID);
    await userRef.update({
      Location: true,
    })

    return res.status(200).json({
      locationUpdated: true,
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.disableLocation = async (req, res, next) => {
  try {
    const userUID = req.user.uid;

    const userRef = DB.collection('users').doc(userUID);
    await userRef.update({
      Location: false,
    })

    return res.status(200).json({
      locationUpdated: true,
    })

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.AccountPrivacy = async (req, res, next) => {
  try {
    const userUID = req.user.uid;
    const { privateAccount } = req.body;

    const userRef = DB.collection('users').doc(userUID);
    await userRef.update({
      privateAccount: privateAccount,
    })

    return res.status(200).json({
      locationUpdated: true,
    })
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.sendChatmateRequest = async (req, res, next) => {
  try {
    const senderUUID = req.body.senderUUID;
    const receiverUUID = req.params.receiverId;
    let username;
    let profileImage;

    const querySnapshot = await DB.collection('users')
      .where('userId', '==', senderUUID).get();

    querySnapshot.forEach(doc => {
      username = doc.data().username;
      profileImage = doc.data().profileImage;
    });


    const notificationRef = DB.collection('notifications').doc();
    await notificationRef.set({
      notificationId: 'notification_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      senderName: username,
      profileImage: profileImage || null,
      senderId: senderUUID,
      receiverId: receiverUUID,
      notificationType: 'Chatmate_Request',
      status: 'pending',
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      requested: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.getAllNotifications = async (req, res, next) => {
  try {
    const CustomUUID = req.params.CustomUUID;


    const querySnapshot = await DB.collection('notifications')
      .where('receiverId', '==', CustomUUID)
      .get();

    const followRequests = [];
    const messageNotifications = [];
    querySnapshot.forEach(doc => {
      if (doc.data().notificationType === 'Chatmate_Request') {
        followRequests.push(doc.data());
      } else if (doc.data().notificationType === 'message') {
        messageNotifications.push(doc.data());
      }
    });

    return res.status(200).json({
      followRequests: followRequests,
      messageNotifications: messageNotifications,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.AcceptChatmateRequest = async (req, res, next) => {
  try {
    const { SenderUUID, ReciverUUID } = req.body;
    console.log(SenderUUID, ReciverUUID);
    
    const senderSnapshot = await DB.collection('users').where('userId', '==', SenderUUID).get();
    const receiverSnapshot = await DB.collection('users').where('userId', '==', ReciverUUID).get();

    const senderName = senderSnapshot.docs[0].data().name;
    const receiverName = receiverSnapshot.docs[0].data().name;
    const senderProfileImage = senderSnapshot.docs[0].data().profileImage;
    const receiverProfileImage = receiverSnapshot.docs[0].data().profileImage;

    const transactionFunction = async (transaction) => {
      const senderFollowersRef = DB.collection('Chatmates').doc(SenderUUID);
      const receiverFollowersRef = DB.collection('Chatmates').doc(ReciverUUID);

      let senderDoc = await transaction.get(senderFollowersRef);
      let receiverDoc = await transaction.get(receiverFollowersRef);

      const notificationsRef = DB.collection('notifications');
      const querySnapshot = await notificationsRef
        .where('receiverId', '==', ReciverUUID)
        .where('senderId', '==', SenderUUID)
        .get();

      if (!senderDoc.exists) {
        transaction.set(senderFollowersRef, { chatmates: [] });
      }

      if (!receiverDoc.exists) {
        transaction.set(receiverFollowersRef, { chatmates: [] });
      }

      const senderChatmates = (senderDoc.exists ? senderDoc.data().chatmates : []) || [];
      const receiverChatmates = (receiverDoc.exists ? receiverDoc.data().chatmates : []) || [];

      const updatedSenderChatmates = [...senderChatmates, { userId: ReciverUUID, name: receiverName, profileImage: receiverProfileImage || null, }];
      const updatedReceiverChatmates = [...receiverChatmates, { userId: SenderUUID, name: senderName, profileImage: senderProfileImage || null, }];

      transaction.update(senderFollowersRef, { chatmates: updatedSenderChatmates });
      transaction.update(receiverFollowersRef, { chatmates: updatedReceiverChatmates });

      const senderUserRef = (await DB.collection('users').where('userId', '==', SenderUUID).get()).docs[0].ref;
      const receiverUserRef = (await DB.collection('users').where('userId', '==', ReciverUUID).get()).docs[0].ref;

      transaction.update(senderUserRef, { chatmateCount: admin.firestore.FieldValue.increment(1) });
      transaction.update(receiverUserRef, { chatmateCount: admin.firestore.FieldValue.increment(1) });

      querySnapshot.forEach((doc) => {
        batch.update(doc.ref, { notificationType: 'accepted' });
      });
    };

    const batch = DB.batch();

    await DB.runTransaction(async (transaction) => {
      await transactionFunction(transaction);
      await batch.commit();
    });

    return res.status(200).json({
      accepted: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};


exports.RejectChatmateRequest = async (req, res, next) => {
  try {
    const { SenderUUID, ReciverUUID } = req.body;

    const querySnapshot = await DB.collection('notifications')
      .where('senderId', '==', SenderUUID)
      .where('receiverId', '==', ReciverUUID)
      .get();

    const batch = DB.batch();

    querySnapshot.forEach((doc) => {
      batch.update(doc.ref, { notificationType: 'rejected' });
    });

    await batch.commit();

    return res.status(200).json({
      rejected: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.checkFollowing = async (req, res, next) => {
  try {
    const { userUUID, otherUserUUID } = req.body;

    const userDoc = await DB.collection('Chatmates').doc(userUUID).get();

    if (userDoc.exists) {
      const chatmates = userDoc.data().chatmates || [];
      const isFollowing = chatmates.some(chatmate => chatmate.userId === otherUserUUID);

      return res.status(200).json({ isFollowing });
    } else {
      return res.status(200).json({ isFollowing: false });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.AddChatContact = async (req, res, next) => {
  try {
    const { userUUID, otherUserUUID } = req.body;

    let chatId;
    const transactionFunction = async (transaction) => {
      const userChatRef = DB.collection('chats').doc(`${userUUID}_${otherUserUUID}`);
      const userChatDoc = await transaction.get(userChatRef);

      const userChatRef2 = DB.collection('chats').doc(`${otherUserUUID}_${userUUID}`);
      const userChatDoc2 = await transaction.get(userChatRef2);

      const usersRef = DB.collection('users');
      const querySnapshot = await transaction.get(usersRef.where('userId', '==', userUUID));

      const otherUsersRef = DB.collection('users');
      const otherQuerySnapshot = await transaction.get(usersRef.where('userId', '==', otherUserUUID));


      if (userChatDoc.exists) {
        chatId = `${userUUID}_${otherUserUUID}`;

      } else if (userChatDoc2.exists) {
        chatId = `${otherUserUUID}_${userUUID}`;

      } else {
        chatId = `${userUUID}_${otherUserUUID}`;

        transaction.set(userChatRef, {
          chatId: `${userUUID}_${otherUserUUID}`,
          participants: [userUUID, otherUserUUID],
          unreadCount: 0,
          lastMessage: {},
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const messagesRef = userChatRef.collection('messages');
        transaction.set(messagesRef.doc(), { timestamp: admin.firestore.FieldValue.serverTimestamp(), });

        querySnapshot.forEach(doc => {
          const userData = doc.data();
          const updatedContacts = userData.contacts ? [...userData.contacts] : [];
          if (!updatedContacts.includes(otherUserUUID)) {
            updatedContacts.push(otherUserUUID);
          }
          transaction.update(usersRef.doc(doc.id), {
            contacts: updatedContacts,
          });
        });

        otherQuerySnapshot.forEach(doc => {
          const userData = doc.data();
          const updatedContacts = userData.contacts ? [...userData.contacts] : [];
          if (!updatedContacts.includes(userUUID)) {
            updatedContacts.push(userUUID);
          }
          transaction.update(otherUsersRef.doc(doc.id), {
            contacts: updatedContacts,
          });
        });

      }
    };

    await DB.runTransaction(transactionFunction);

    return res.status(200).json({
      chatId: chatId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

exports.getChatContacts = async (req, res, next) => {
  try {
    const CustomUUID = req.params.CustomUUID;
    const querySnapshot = await DB.collection('users').where('userId', '==', CustomUUID).get();
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();

      if (userData.contacts) {
        const chatPromises = userData.contacts.map(async contactId => {
          let chatId = `${CustomUUID}_${contactId}`;
          let chatSnapshot = await DB.collection('chats').doc(chatId).get();

          if (!chatSnapshot.exists) {
            chatId = `${contactId}_${CustomUUID}`;
            chatSnapshot = await DB.collection('chats').doc(chatId).get();
          }

          if (chatSnapshot.exists) {
            const { ...chatData } = chatSnapshot.data();
            return chatData;
          } else {
            return null;
          }
        });

        const chatResults = await Promise.all(chatPromises);

        return res.status(200).json({
          contacts: chatResults.filter(chat => chat !== null),
        });

      } else {
        return res.status(200).json({
          contacts: [],
        });
      }
    }
    return res.status(200).json({
      contacts: [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};



exports.getContactDetails = async (req, res, next) => {
  try {
    const CustomUUID = req.params.CustomUUID;

    const querySnapshot = await DB.collection('users').where('userId', '==', CustomUUID).get();
    const ownDocRef = await DB.collection('users').doc(req.user.uid).get();

    const { username, profileImage, activityStatus, lastActive, blockedUsers } = querySnapshot.docs[0].data();
    const ownBlockedUsers = ownDocRef.data().blockedUsers;
    const ownUserId = ownDocRef.data().userId;

    let blockedFromOtherSide = blockedUsers.includes(ownUserId);
    let blockedFromOurSide = ownBlockedUsers.includes(CustomUUID);

    return res.status(200).json({
      userDetails: {
        username: username,
        profileImage: profileImage || null,
        activityStatus: activityStatus,
        lastActive: lastActive,
        blockedFromOurSide: blockedFromOurSide,
        blockedFromOtherSide: blockedFromOtherSide,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.getCallOffer = async (req, res, next) => {
  try {
    const { DocId } = req.params;

    const docRef = await DB.collection('calls').doc(DocId).get();
    const documentData = docRef.data();

    return res.status(200).json({
      offer: documentData
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.UpdateCallStatus = async (req, res, next) => {
  try {
    const { DocId, status } = req.body;

    const docRef = DB.collection('calls').doc(DocId);
    await docRef.update({ status: status });

    return res.status(200).json({
      offerUpdated: true
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.AddTale = async (req, res, next) => {
  try {
    const images = req.files.map(file => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer, // Contains the file buffer
    }));

    const { caption, texts, filter } = req.body;
    const user = req.user;

    const uploadedFileUrls = [];
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const fileName = uuid.v4();
      const fileBuffer = file.buffer;

      const filePath = `images/${fileName}.jpg`;
      await BUCKET.file(filePath).save(fileBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      const [url] = await BUCKET.file(filePath).getSignedUrl({
        action: 'read',
        expires: '01-01-3000'
      });

      uploadedFileUrls.push(url);
    }

    const userRef = DB.collection('users').doc(user.uid);
    const time = admin.firestore.FieldValue.serverTimestamp();

    let parsedFilter = [];
    if (Array.isArray(filter)) {
      for (let i = 0; i < filter.length; i++) {
        parsedFilter.push(JSON.parse(filter[i]));
      }
    } else {
      const fil = [filter];
      for (let i = 0; i < fil.length; i++) {
        parsedFilter.push(JSON.parse(fil[i]));
      }
    }

    await userRef.update({
      tale: admin.firestore.FieldValue.arrayUnion({
        images: uploadedFileUrls,
        filters: parsedFilter,
        caption: caption,
        texts: JSON.parse(texts),
        seenBy: [],
        likedBy: [],
        createdAt: new Date(),
      }),
    });

    res.status(200).json({ message: 'Tale Added' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.GetTales = async (req, res, next) => {
  try {
    const page = parseInt(req.params.page) || 1;
    const pageSize = parseInt(req.params.pageSize) || 10;
    const offset = (page - 1) * pageSize;
    const user = req.user;

    const userDoc = await DB.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const contacts = userDoc.data().contacts || [];
    const myTales = userDoc.data().tale || [];

    let allContactTales = [];

    for (const contactUUID of contacts) {
      const contactDoc = await DB.collection('users')
        .where('userId', '==', contactUUID)
        .orderBy('createdAt', 'desc')
        .limit(pageSize)
        .offset(offset)
        .get();

      const contactTales = [];
      contactDoc.docs.forEach(doc => {
        const data = doc.data();
        if (!data.blockedUsers.includes(userDoc.data().userId) && !userDoc.data().blockedUsers.includes(contactUUID)) {
          if (data.tale) {
            if (data.tale.length > 0) {
              contactTales.push({
                tale: data.tale,
                username: data.username,
                userId: data.userId,
                profileImage: data.profileImage || null,
              });
            }
          }
        }
      });
      allContactTales = allContactTales.concat(contactTales);
    }

    res.status(200).json({
      tales: allContactTales,
      myTales: {
        tale: myTales,
        username: userDoc.data().username,
        userId: userDoc.data().userId,
        profileImage: userDoc.data().profileImage || null,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.UpdateSeenBy = async (req, res, next) => {
  try {
    const { WatcherUUID, ShowerUUID } = req.body;
    console.log(WatcherUUID, ShowerUUID);
    const userQuerySnapshot = await DB.collection('users').where('userId', '==', ShowerUUID).get();
    const watcherQuerySnapshot = await DB.collection('users').where('userId', '==', WatcherUUID).get();
    const batch = DB.batch();

    userQuerySnapshot.forEach(userDoc => {
      const userData = userDoc.data();
      const WatcherData = watcherQuerySnapshot.docs[0].data();
      const updatedTale = userData.tale.map(tale => {
        if (!tale.seenBy || !tale.seenBy.some(seen => seen.userId === WatcherUUID)) {
          return {
            ...tale,
            seenBy: [...(tale.seenBy || []), {
              profileImage: WatcherData.profileImage || null,
              username: WatcherData.username,
              userId: WatcherUUID,
              timestamp: Date.now()
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

    res.status(200).json({
      updated: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.getChatSharedMedia = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    const messagesRef = DB.collection('chats').doc(chatId).collection('messages');
    const querySnapshot = await messagesRef.get();

    let images = [];
    querySnapshot.forEach(doc => {
      const messageData = doc.data();
      if (messageData.messageType === 'image') {
        for (let j = 0; j < messageData.metadata.attachments.length; j++) {
          images.push(messageData.metadata.attachments[j]);
        }
      }
    });

    res.status(200).json({
      media: images,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.BlockUser = async (req, res, next) => {
  try {
    const { BlockUUID } = req.params;
    const user = req.user;

    const docRef = DB.collection('users').doc(user.uid);

    docRef.update({
      blockedUsers: admin.firestore.FieldValue.arrayUnion(BlockUUID),
    });

    res.status(200).json({
      blocked: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.getBlockedAccounts = async (req, res, next) => {
  try {
    const user = req.user;

    const docSnapshot = await DB.collection('users').doc(user.uid).get();

    const blockList = docSnapshot.data().blockedUsers || [];

    let accounts = [];
    if (blockList.length > 0) {
      for (const userId of blockList) {
        const querySnapshot = await DB.collection('users').where('userId', '==', userId).get();
        if (querySnapshot.empty) {
          continue;
        } else {
          accounts.push({
            profileImage: querySnapshot.docs[0].data().profileImage || null,
            username: querySnapshot.docs[0].data().username,
            userId: userId,
          });
        }
      }
    }

    res.status(200).json({
      accounts: accounts,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.unblockUser = async (req, res, next) => {
  try {
    const { BlockUUID } = req.params;
    const user = req.user;

    const docRef = DB.collection('users').doc(user.uid);

    await docRef.update({
      blockedUsers: admin.firestore.FieldValue.arrayRemove(BlockUUID),
    })

    res.status(200).json({
      unblocked: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.getChatmates = async (req, res, next) => {
  try {
    const { userUUID } = req.params;
    const docSnapshot = await DB.collection('Chatmates').doc(userUUID).get();

    const data = docSnapshot.data().chatmates;

    res.status(200).json({
      chatmates: data,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.checkMutualFriends = async (req, res, next) => {
  try {
    const { otherUserUUID, ownUserUUID } = req.params;


    const ownUserDoc = DB.collection('Chatmates').doc(ownUserUUID);
    const otherUserDoc = DB.collection('Chatmates').doc(otherUserUUID);

    const ownUserData = await ownUserDoc.get();
    const otherUserData = await otherUserDoc.get();

    const ownUserFriends = ownUserData.data().chatmates || [];
    const otherUserFriends = otherUserData.data().chatmates || [];

    const ownUserFriendIds = ownUserFriends.map(friend => friend.userId);
    const otherUserFriendIds = otherUserFriends.map(friend => friend.userId);

    const mutualUserIds = ownUserFriendIds.filter(userId => otherUserFriendIds.includes(userId));

    const mutualFriends = ownUserFriends.filter(friend => mutualUserIds.includes(friend.userId));

    res.status(200).json({
      friends: mutualFriends,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.userRecommendation = async (req, res, next) => {
  try {
    const { CustomUUID } = req.params;

    const users = await recommendUsers(CustomUUID, 5);

    res.status(200).json({
      recommendations: users,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.addRecentSearches = async (req, res, next) => {
  try {
    const { CustomUUID } = req.params;
    const { name, username, userId, profileImage } = req.body;

    const data = {
      name: name,
      username: username,
      userId: userId,
      profileImage: profileImage || null,
      searchAdded: new Date(),
    }

    const docRef = DB.collection('recentSearches').doc(CustomUUID);

    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) {
      await docRef.set({ recentSearches: [] });
    }

    const recentSearches = (docSnapshot.data() && docSnapshot.data().recentSearches) || [];

    const searchExists = recentSearches.some(search => search.userId === userId);

    if (!searchExists) {
      await docRef.update({
        recentSearches: admin.firestore.FieldValue.arrayUnion(data),
      });
    }

    res.status(200).json({
      recentSearchAdded: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.getRecentSearches = async (req, res, next) => {
  try {
    const { CustomUUID } = req.params;

    const docRef = await DB.collection('recentSearches').doc(CustomUUID).get();

    if (docRef.exists) {
      const recentSearches = docRef.data().recentSearches || [];

      return res.status(200).json({
        recentSearches: recentSearches,
      });
    }

    res.status(200).json({
      recentSearches: [],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.removeRecentSearches = async (req, res, next) => {
  try {
    const { CustomUUID, TargetUUID } = req.params;

    const docRef = DB.collection('recentSearches').doc(CustomUUID);

    const docSnapshot = await docRef.get();
    const recentSearches = docSnapshot.data().recentSearches || [];

    const updatedRecentSearches = recentSearches.filter(search => search.userId !== TargetUUID);

    await docRef.update({ recentSearches: updatedRecentSearches });

    res.status(200).json({
      removed: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.clearAllRecentSearches = async (req, res, next) => {
  try {
    const { CustomUUID } = req.params;

    const docRef = DB.collection('recentSearches').doc(CustomUUID);

    await docRef.update({ recentSearches: [] });

    res.status(200).json({
      cleared: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
exports.markNotificationsAsRead = async (req, res, next) => {
  try {
    const { notificationId, CustomUUID } = req.params;

    if (notificationId !== 'null') {
      const querySnapshot = await DB.collection('notifications').where('notificationId', '==', notificationId).get();
      if (!querySnapshot.empty) {
        const docRef = querySnapshot.docs[0].ref;
        await docRef.update({ isRead: true });
      }
    } else {
      const querySnapshot = await DB.collection('notifications').where('receiverId', '==', CustomUUID).get();
      querySnapshot.forEach(async doc => {
        const docRef = doc.ref;
        await docRef.update({ isRead: true });
      });
    }

    res.status(200).send("Notifications marked as read.");

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.checkBlockedUser = async (req, res, next) => {
  try {
    const { TargetUUID } = req.params;
    const user = req.user;

    const docRef = await DB.collection('users').doc(user.uid).get();

    const data = docRef.data().blockedUsers;

    for (let i = 0; i < data.length; i++) {
      if (data[i] === TargetUUID) {
        return res.status(200).json({
          blocked: true,
        });
      }
    }

    return res.status(200).json({
      blocked: false,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.deleteCurrentTale = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { imageURI } = req.body;

    // Find the document containing the tale array
    const userDoc = await DB.collection('users').doc(uid).get();
    const userData = userDoc.data();

    // Remove the imageURI from the images array in the tale
    const updatedTale = userData.tale.map(tale => ({
      ...tale,
      images: tale.images.filter(uri => uri !== imageURI),
    }));

    // Update the document with the modified tale array
    await DB.collection('users').doc(uid).update({ tale: updatedTale });

    return res.status(200).json({
      deleted: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.muteUser = async (req, res, next) => {
  try {
    const MuteUUID = req.params;

    const docRef = DB.collection('users').doc(req.user.uid);

    await docRef.update({
      mutedUsers: admin.firestore.FieldValue.arrayUnion(MuteUUID),
    });

    return res.status(200).json({
      muted: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


exports.unMuteUser = async (req, res, next) => {
  try {
    const MuteUUID = req.params;

    const docRef = DB.collection('users').doc(req.user.uid);

    await docRef.update({
      mutedUsers: admin.firestore.FieldValue.arrayRemove(MuteUUID),
    });

    return res.status(200).json({
      muted: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.checkMutedUser = async (req, res, next) => {
  try {
    const MuteUUID = req.params;

    const docRef = await DB.collection('users').doc(req.user.uid).get();

    const data = await docRef.data().mutedUsers;

    return res.status(200).json({
      muted: data.includes(MuteUUID),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

exports.removeChatmate = async (req, res, next) => {
  try {
    const { SenderUUID, CustomUUID } = req.params;

    const senderDocRef = DB.collection('Chatmates').doc(SenderUUID);
    const myDocRef = DB.collection('Chatmates').doc(CustomUUID);
    const senderQueryDocRef = await DB.collection('users').where('userId', '==', SenderUUID).get();
    const myQueryDocRef = await DB.collection('users').where('userId', '==', CustomUUID).get();

    await DB.runTransaction(async (transaction) => {
      const senderDoc = await transaction.get(senderDocRef);
      const myDoc = await transaction.get(myDocRef);

      let senderChatmates = senderDoc.data().chatmates || [];
      let myChatmates = myDoc.data().chatmates || [];

      senderChatmates = senderChatmates.filter(chatmate => chatmate.userId !== CustomUUID);

      myChatmates = myChatmates.filter(chatmate => chatmate.userId !== SenderUUID);

      transaction.update(senderDocRef, { chatmates: senderChatmates });

      transaction.update(myDocRef, { chatmates: myChatmates });

      senderQueryDocRef.forEach(doc => {
        const currentCount = doc.data().chatmateCount || 0;
        transaction.update(doc.ref, { chatmateCount: currentCount === 0 ? 0 : currentCount - 1 });
      });

      myQueryDocRef.forEach(doc => {
        const currentCount = doc.data().chatmateCount || 0;
        transaction.update(doc.ref, { chatmateCount: currentCount === 0 ? 0 : currentCount - 1 });
      });
    });

    return res.status(200).json({
      message: 'Chatmate removed successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


