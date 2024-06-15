const { Expo } = require('expo-server-sdk')



exports.sendMobileNotification = async (params) => {
  try {
    let expo = new Expo({
      useFcmV1: true,
    });
    const { ExpoPushToken, Type } = params;




    let messages = [];

    if (Type === 'CHATMATE_REQUEST') {
      const { senderUUID, CustomUUID, profileImage, username } = params;
      messages = [{
        to: ExpoPushToken,
        sound: 'default',
        body: `${username} wants to be your Chatmate`,
        data: { senderUUID, CustomUUID, profileImage, username },
      }];
    }
    if (Type === 'MESSAGE_SENT') {
      const { message, chatId, username, profileImage, blockedFromOther, blockedFromOur, onlineStatus, lastOnline } = params;
      messages = [{
        to: ExpoPushToken,
        sound: 'default',
        title: username,
        body: message,
        data: { message, chatId, username, profileImage, blockedFromOther, blockedFromOur, onlineStatus, lastOnline, },
      }];
    }
    if (Type === 'TALE_REPLY') {
      const { username, profileImage } = params;
      messages = [{
        to: ExpoPushToken,
        sound: 'default',
        body: `${username} Replied to your Tale`,
      }];
    }
    if (Type === 'TALE_LIKED') {
      const { username, profileImage } = params;
      messages = [{
        to: ExpoPushToken,
        sound: 'default',
        body: `${username} Liked your Tale`,
      }];
    }
    if (Type === 'ACCEPTED_REQUEST') {
      const { username, profileImage } = params;
      messages = [{
        to: ExpoPushToken,
        sound: 'default',
        body: `${username} Accpeted your Chatmate Request`,
      }];
    }

    if (!Expo.isExpoPushToken(ExpoPushToken)) {
      console.error(`Push token ${ExpoPushToken} is not a valid Expo push token`);
    }

    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    (async () => {
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log(ticketChunk);
          tickets.push(...ticketChunk);
          // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
        } catch (error) {
          console.error(error);
        }
      }
    })();

    let receiptIds = [];
    for (let ticket of tickets) {
      if (ticket.status === 'ok') {
        receiptIds.push(ticket.id);
      }
    }

    let receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    (async () => {
      for (let chunk of receiptIdChunks) {
        try {
          let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          console.log(receipts);
          for (let receiptId in receipts) {
            let { status, message, details } = receipts[receiptId];
            if (status === 'ok') {
              continue;
            } else if (status === 'error') {
              console.error(
                `There was an error sending a notification: ${message}`
              );
              if (details && details.error) {
                console.error(`The error code is ${details.error}`);
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    })();

  } catch (error) {
    console.log(error)
  }
}



