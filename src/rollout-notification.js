import sendGCM from './sendGCM';
import APN from './sendAPN';
import sendADM from './sendADM';
import sendWNS from './sendWNS';
import sendWebPush from './sendWeb';
import {
  DEFAULT_SETTINGS,
  UNKNOWN_METHOD,
  WEB_METHOD,
  WNS_METHOD,
  ADM_METHOD,
  GCM_METHOD,
  APN_METHOD,
} from './constants';

class PN {
  constructor(options) {
    this.setOptions(options);
  }

  setOptions(opts) {
    this.settings = { ...DEFAULT_SETTINGS, ...opts };
    if (this.apn) {
      this.apn.shutdown();
    }
    this.apn = new APN(this.settings.apn);
  }

  sendWith(method, regIds, data, cb) {
    return method(regIds, data, this.settings)
      .then((results) => {
        (cb || ((noop) => noop))(null, results);
        return results;
      })
      .catch((error) => {
        (cb || ((noop) => noop))(error);
        return Promise.reject(error);
      });
  }

  getPushMethodByRegId(regId) {
    if (typeof regId === 'object') {
      return WEB_METHOD;
    }
    if (this.settings.isAlwaysUseFCM) {
      return GCM_METHOD;
    }
    if (regId.substring(0, 4) === 'http') {
      return WNS_METHOD;
    }
    if (/^(amzn[0-9]*.adm)/i.test(regId)) {
      return ADM_METHOD;
    }
    if (regId.length > 64) {
      return GCM_METHOD;
    }
    if (regId.length === 64) {
      return APN_METHOD;
    }
    return UNKNOWN_METHOD;
  }

  send(_regIds, data, callback) {
    const promises = [];
    const regIdsGCM = [];
    const regIdsAPN = [];
    const regIdsWNS = [];
    const regIdsADM = [];
    const regIdsWebPush = [];
    const regIdsUnk = [];
    const regIds = Array.isArray(_regIds || []) ? _regIds || [] : [_regIds];

    // Classify each pushId for corresponding device
    regIds.forEach((regId) => {
      const pushMethod = this.getPushMethodByRegId(regId);

      if (pushMethod === WEB_METHOD) {
        regIdsWebPush.push(regId);
      } else if (pushMethod === GCM_METHOD) {
        regIdsGCM.push(regId);
      } else if (pushMethod === WNS_METHOD) {
        regIdsWNS.push(regId);
      } else if (pushMethod === ADM_METHOD) {
        regIdsADM.push(regId);
      } else if (pushMethod === APN_METHOD) {
        regIdsAPN.push(regId);
      } else {
        regIdsUnk.push(regId);
      }
    });

    try {
      // Android GCM
      if (regIdsGCM.length > 0) {
        promises.push(this.sendWith(sendGCM, regIdsGCM, data));
      }

      // iOS APN
      if (regIdsAPN.length > 0) {
        promises.push(
          this.sendWith(this.apn.sendAPN.bind(this.apn), regIdsAPN, data)
        );
      }

      // Microsoft WNS
      if (regIdsWNS.length > 0) {
        promises.push(this.sendWith(sendWNS, regIdsWNS, data));
      }

      // Amazon ADM
      if (regIdsADM.length > 0) {
        promises.push(this.sendWith(sendADM, regIdsADM, data));
      }

      // Web Push
      if (regIdsWebPush.length > 0) {
        promises.push(this.sendWith(sendWebPush, regIdsWebPush, data));
      }
    } catch (err) {
      promises.push(Promise.reject(err));
    }

    // Unknown
    if (regIdsUnk.length > 0) {
      const results = {
        method: 'unknown',
        success: 0,
        failure: regIdsUnk.length,
        message: [],
      };
      regIdsUnk.forEach((regId) => {
        results.message.push({
          regId,
          error: new Error('Unknown registration id'),
        });
      });
      promises.push(Promise.resolve(results));
    }

    // No regIds detected
    if (promises.length === 0) {
      promises.push(
        Promise.resolve({
          method: 'none',
          success: 0,
          failure: 0,
          message: [],
        })
      );
    }

    return Promise.all(promises)
      .then((results) => {
        const cb = callback || ((noop) => noop);
        cb(null, results);
        return results;
      })
      .catch((err) => {
        const cb = callback || ((noop) => noop);
        cb(err);
        return Promise.reject(err);
      });
  }
}

module.exports = PN;
