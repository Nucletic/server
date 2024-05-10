const express = require('express');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const router = express.Router();


const userController = require('../controllers/UserController');

router.post('/users/register', userController.register);
router.put('/users/update', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), upload.array('images', 2), userController.updateProfile);
router.post('/users/resendVerificationEmail', userController.verifyToken, userController.resendVerificationEmail);
router.post('/users/forgotPassword', userController.sendPasswordResetEmail);
router.get('/users/profile', userController.verifyToken, userController.grantAccess('readOwn', 'profile'), userController.getOwnProfile);
router.get('/users/:userId/profile', userController.verifyToken, userController.grantAccess('readAny', 'profile'), userController.getUserProfile);
router.put('/users/editProfile', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), upload.array('images', 2), userController.editProfile);
router.post('/users/requestEmailChange', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.requestEmailChange);
router.put('/users/enableLocation', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.enableLocation);
router.put('/users/disableLocation', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.disableLocation);
router.put('/users/AccountPrivacy', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.AccountPrivacy);
router.post('/users/:receiverId/ChatmateRequest', userController.verifyToken, userController.grantAccess('createOwn', 'ChatmateRequest'), userController.sendChatmateRequest);
router.get('/users/:CustomUUID/getAllNotifications', userController.verifyToken, userController.grantAccess('readOwn', 'Notifications'), userController.getAllNotifications);
router.put('/users/AcceptChatmateRequest', userController.verifyToken, userController.grantAccess('updateAny', 'ChatmateRequest'), userController.AcceptChatmateRequest);
router.delete('/users/RejectChatmateRequest', userController.verifyToken, userController.grantAccess('updateAny', 'ChatmateRequest'), userController.RejectChatmateRequest);
router.post('/users/checkFollowing', userController.verifyToken, userController.grantAccess('readOwn', 'profile'), userController.checkFollowing);
router.post('/users/AddChatContact', userController.verifyToken, userController.grantAccess('createOwn', 'Chat'), userController.AddChatContact);
router.get('/users/getChatContacts/:CustomUUID', userController.verifyToken, userController.grantAccess('readOwn', 'profile'), userController.getChatContacts);
router.get('/users/getContactDetails/:CustomUUID', userController.verifyToken, userController.grantAccess('readAny', 'profile'), userController.getContactDetails);
router.get('/users/getCallOffer/:DocId', userController.verifyToken, userController.grantAccess('readOwn', 'CallOffer'), userController.getCallOffer);
router.post('/users/AddTale', userController.verifyToken, userController.grantAccess('createOwn', 'Tale'), upload.array('image'), userController.AddTale);
router.get('/users/GetTales/:page/:pageSize', userController.verifyToken, userController.grantAccess('readAny', 'Tale'), userController.GetTales);
router.put('/users/UpdateSeenBy', userController.verifyToken, userController.grantAccess('updateAny', 'SeenBy'), userController.UpdateSeenBy);
router.get('/users/getChatSharedMedia/:chatId', userController.verifyToken, userController.grantAccess('readOwn', 'Messages'), userController.getChatSharedMedia);
router.put('/users/blockUser/:BlockUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'BlockList'), userController.BlockUser);
router.get('/users/getBlockedAccounts', userController.verifyToken, userController.grantAccess('readOwn', 'BlockList'), userController.getBlockedAccounts);
router.patch('/users/unblockUser/:BlockUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'BlockList'), userController.unblockUser);
router.get('/users/getChatmates/:userUUID', userController.verifyToken, userController.grantAccess('readAny', 'profile'), userController.getChatmates);
router.get('/users/checkMutualFriends/:otherUserUUID/:ownUserUUID', userController.verifyToken, userController.grantAccess('readAny', 'profile'), userController.checkMutualFriends);

router.get('/users/getUserRecommendations/:CustomUUID', userController.verifyToken, userController.grantAccess('readAny', 'profile'), userController.userRecommendation);

router.post('/users/addRecentSearches/:CustomUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'RecentSearches'), userController.addRecentSearches);
router.get('/users/getRecentSearches/:CustomUUID', userController.verifyToken, userController.grantAccess('readOwn', 'RecentSearches'), userController.getRecentSearches);
router.patch('/users/removeRecentSearches/:CustomUUID/:TargetUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'RecentSearches'), userController.removeRecentSearches);
router.patch('/users/clearAllRecentSearches/:CustomUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'RecentSearches'), userController.clearAllRecentSearches);
router.patch('/users/markNotificationsAsRead/:CustomUUID/:notificationId', userController.verifyToken, userController.grantAccess('updateOwn', 'Notifications'), userController.markNotificationsAsRead);
router.get('/users/checkBlockedUser/:TargetUUID', userController.verifyToken, userController.grantAccess('readOwn', 'profile'), userController.checkBlockedUser);
router.delete('/users/deleteCurrentTale/', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.deleteCurrentTale);
router.patch('/users/Mute/:MuteUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.muteUser);
router.patch('/users/unMuteUser/:MuteUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.unMuteUser);
router.get('/users/checkMutedUser/:MuteUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.checkMutedUser);
router.patch('/users/removeChatmate/:SenderUUID/:CustomUUID', userController.verifyToken, userController.grantAccess('updateOwn', 'profile'), userController.removeChatmate);
module.exports = router;