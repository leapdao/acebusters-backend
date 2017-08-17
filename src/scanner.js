const P_EMPTY = '0x0000000000000000000000000000000000000000';

class ScanManager {
  constructor(factory, table, dynamo, sns, sentry, topicArn) {
    this.factory = factory;
    this.table = table;
    this.dynamo = dynamo;
    this.sns = sns;
    this.sentry = sentry;
    this.topicArn = topicArn;
  }

  async scan() {
    const tables = await this.factory.getTables();
    if (!tables || tables.length === 0) {
      this.log('no contracts to scan');
    }

    return Promise.all(tables.map(this.handleTable.bind(this)));
  }

  async handleTable(tableAddr) {
    const [lhn, lnr, lnt] = await Promise.all([
      this.table.getLastHandNetted(tableAddr),
      this.table.getLNRHandId(tableAddr),
      this.table.getLNRTime(tableAddr),
    ]);

    if (lnr > lhn) {
      const now = Math.floor(Date.now() / 1000);
      if (lnt + (60 * 10) < now) {
        if (lnt + (60 * 60) > now) {
          // if the dispute period is over
          // send transaction to net up in contract
          const subject = `ProgressNetting::${tableAddr}`;
          return this.notify({}, subject).then(() =>
            this.log(subject, { tags: { tableAddr }, extra: { lhn, lnr, lnt, now } }));
        }
        return null;
        // if dispute period is over since more than 1 hour,
        // do nothing
      }
      // don't react to netting requests younger than 3 minutes,
      // if it is older, and there is still time to sibmit receipt,
      // create event to submit dispute receipts.
      if (now > lnt + (60 * 3)) {
        const subject = `HandleDispute::${tableAddr}`;
        return this.notify({
          tableAddr,
          lastHandNetted: lhn,
          lastNettingRequest: lnr,
        }, subject).then(() => this.log(subject, {
          tags: { tableAddr },
          extra: { lhn, lnr, lnt, now },
        }));
      }

      return null;
    }

    // contract is netted up,
    // check if more netting can be done from oracle
    const [lastHand, lineup] = await Promise.all([
      this.dynamo.getLastHand(tableAddr),
      this.table.getLineup(tableAddr),
    ]);

    if (!lastHand || !lastHand.handId) {
      return null;
    }

    const results = [];
    // 1 hour
    const tooOld = Math.floor(Date.now() / 1000) - (60 * 60);
    if (lastHand.lineup) {
      // 5 minutes
      const old = Math.floor(Date.now() / 1000) - (5 * 60);
      const subject = `Kick::${tableAddr}`;
      let hasPlayer = false;
      for (let i = 0; i < lastHand.lineup.length; i += 1) {
        if (lastHand.lineup[i].sitout && typeof lastHand.lineup[i].sitout === 'number') {
          // check if any of the sitout flags are older than 5 min
          if (lastHand.lineup[i].sitout < old) {
            const seat = lastHand.lineup[i];
            results.push(this.notify({ pos: i, tableAddr }, subject).then(() =>
              this.log(subject, {
                tags: { tableAddr },
                user: { id: seat.address },
                extra: { sitout: seat.sitout },
              }),
            ));
          }
        }
        if (lastHand.lineup[i].address !== P_EMPTY) {
          hasPlayer = true;
        }
      }
      if (lastHand.changed > tooOld && hasPlayer) {
        results.push(this.notify({ tableAddr }, `Timeout::${tableAddr}`));
      }
    }

    const hasExitHands = lineup[3].some(exitHand => exitHand > 0);
    if (hasExitHands && lastHand.changed > tooOld) {
      // if some players trying to leave
      // prepare netting in db
      const subject = `TableNettingRequest::${tableAddr}`;
      results.push(this.notify({
        handId: lastHand.handId - 1,
        tableAddr,
      }, subject).then(() =>
        this.log(subject, { tags: { tableAddr }, extra: { lhn, handId: lastHand.handId } })),
      );
    }

    return Promise.all(results);
  }

  err(e) {
    this.sentry.captureException(e, { server_name: 'interval-scanner' }, (sendErr) => {
      if (sendErr) {
        console.error(`Failed to send captured exception to Sentry: ${sendErr}`); // eslint-disable-line no-console
      }
    });
    return e;
  }

  log(message, context) {
    const ctx = context || {};
    ctx.level = (ctx.level) ? ctx.level : 'info';
    ctx.server_name = 'interval-scanner';
    return new Promise((fulfill, reject) => {
      const now = Math.floor(Date.now() / 1000);
      this.sentry.captureMessage(`${now} - ${message}`, ctx, (error, eventId) => {
        if (error) {
          reject(error);
          return;
        }
        fulfill(eventId);
      });
    });
  }

  notify(event, subject) {
    return new Promise((resolve, reject) => {
      this.sns.publish({
        Message: JSON.stringify(event),
        Subject: subject,
        TopicArn: this.topicArn,
      }, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(subject);
      });
    });
  }
}

module.exports = ScanManager;
