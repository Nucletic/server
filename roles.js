const Accesscontrol = require('accesscontrol');
const ac = new Accesscontrol();

exports.roles = (function () {
  ac.grant('user')
    .readOwn('profile')
    .readAny('profile')
    .updateOwn('profile')
    .createOwn('ChatmateRequest')
    .updateAny('ChatmateRequest')
    .createOwn('Chat')
    .createOwn('CallOffer')
    .readOwn('CallOffer')
    .updateOwn('CallOffer')
    .createOwn('Tale')
    .readAny('Tale')
    .updateAny('SeenBy')
    .readOwn('Messages')
    .updateOwn('BlockList')
    .readOwn('BlockList')
    .updateOwn('RecentSearches')
    .readOwn('RecentSearches')
    .readOwn('Notifications')
    .updateOwn('Notifications')
  return ac;
})();