const admin = require('./firebaseAdminSDK');


const { SECRET_KEY } = process.env;
const AUTH = admin.auth();
const DB = admin.firestore();
const STORAGE = admin.storage();


// Function to recommend users based on interests and friends' connections
exports.recommendUsers = async (userId, limit) => {
  try {
    // Retrieve the target user's interests
    // const targetUser = await getUser(userId);
    // const targetInterests = targetUser.interests;

    // Retrieve the target user's friends
    const friends = await getFriends(userId);

    // Initialize an object to store aggregated interests of friends' connections
    const aggregatedInterests = {};

    // Iterate over each friend
    for (const friend of friends) {
      // Retrieve the friend's friends (second-degree connections)
      const secondDegreeFriends = await getFriends(friend.userId);
      
      // Iterate over each second-degree friend
      for (const secondDegreeFriendId of secondDegreeFriends) {
        // Exclude the target user and their direct friends
        if (secondDegreeFriendId.userId !== userId && !friends.includes(secondDegreeFriendId.userId)) {
          // Retrieve the interests of the second-degree friend
          const secondDegreeFriend = await getUser(secondDegreeFriendId.userId);
          const interests = secondDegreeFriend.interests;

          // Aggregate the interests
          for (const interest of interests) {
            if (!aggregatedInterests[interest]) {
              aggregatedInterests[interest] = 1;
            } else {
              aggregatedInterests[interest]++;
            }
          }
        }
      }
    }

    // Rank the aggregated interests based on frequency
    const rankedInterests = Object.entries(aggregatedInterests)
      .sort((a, b) => b[1] - a[1])
      .map(([interest, count]) => interest);

    // Here, you can use the ranked interests to recommend users with similar interests


    // Retrieve users with similar interests
    const usersWithSimilarInterests = await getUsersWithSimilarInterests(friends, rankedInterests);

    const recommendations = usersWithSimilarInterests.slice(0, limit);

    return recommendations;

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Example functions to retrieve user data from Firestore
async function getUser(userId) {
  // Assume this function retrieves user data from Firestore based on userId
  const querySnapshot = await DB.collection('users').where('userId', '==', userId).get();
  const data = querySnapshot.docs[0].data();
  return data;
}

async function getFriends(userId) {
  // Assume this function retrieves the list of friends for a user from Firestore
  const userRef = DB.collection('Chatmates').doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new Error(`User with ID ${userId} not found`);
  }
  const userData = userDoc.data();
  return userData.chatmates || [];
}


async function getUsersWithSimilarInterests(friends, interests) {
  // Query Firestore to find users with similar interests
  if (interests.length > 0) {

    const usersRef = DB.collection('users');
    let query = usersRef.where('interests', 'array-contains-any', interests);

    const querySnapshot = await query.get();
    const users = [];
    querySnapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        docId: doc.id,
        userId: userData.userId,
        username: userData.username,
        profileImage: userData.profileImage,
        // Add other user data you want to include in recommendations
        // For example: username, profile picture, etc.
      });
    });
    console.log(users);

    const filteredUsers = users.filter(user => !friends.some(friend => friend.userId === user.userId));
    return filteredUsers;
  } else {
    return [];
  }
}


