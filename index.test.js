import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import EWT from 'ethereum-web-token';
import { ReceiptCache } from 'poker-helper';
import { it, describe, afterEach } from 'mocha';
import BigNumber from 'bignumber.js';
import { Receipt } from 'poker-helper';
import Oracle from './src/index';
import Db from './src/db';
import TableContract from './src/tableContract';

chai.use(sinonChai);

// BET can replace lower bet
// BET can replace SIT_OUT during dealing state
const ABI_BET = [{ name: 'bet', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];

// FOLD can replace all but SIT_OUT, and SHOW, given same amount
const ABI_FOLD = [{ name: 'fold', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];
// SIT_OUT can replace all receipts, given same amount
const ABI_SIT_OUT = [{ name: 'sitOut', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];

// CHECK can replace BET with same amount in pre-flop
const ABI_CHECK_PRE = [{ name: 'checkPre', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];
// CHECK_FLOP can replace BET or CHECK with same amount in flop
const ABI_CHECK_FLOP = [{ name: 'checkFlop', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];
// CHECK_TURN can replace BET or CHECK_FLOP with same amount in turn
const ABI_CHECK_TURN = [{ name: 'checkTurn', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];

// SHOW can replace BET, ALL_IN or CHECK_SHOW with same amount in showdown
const ABI_SHOW = [{ name: 'show', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];

const ABI_LEAVE = [{ name: 'leave', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }] }];

const ABI_DIST = [{ name: 'distribution', type: 'function', inputs: [{ type: 'uint' }, { type: 'uint' }, { type: 'bytes32[]' }] }];

const P1_ADDR = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74';
const P1_KEY = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

// secretSeed: 'brother mad churn often amount wing pretty critic rhythm man insane ridge' }
const P2_ADDR = '0xe10f3d125e5f4c753a6456fc37123cf17c6900f2';
const P2_KEY = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';

// secretSeed: 'erosion warm student north injury good evoke river despair critic wrestle unveil' }
const P3_ADDR = '0xc3ccb3902a164b83663947aff0284c6624f3fbf2';
const P3_KEY = '0x71d2b12dad610fc929e0596b6e887dfb711eec286b7b8b0bdd742c0421a9c425';

// secretSeed: 'erode melody nature bounce sample deny spend give craft alcohol supply roof' }
const P4_ADDR = '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f';
const P4_KEY = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

const tableAddr = '0x00112233445566778899aabbccddeeff00112233';
const EMPTY_ADDR = '0x0000000000000000000000000000000000000000';

const ORACLE_PRIV = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

const deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const bn0 = new BigNumber(0);

const dynamo = {
  getItem() {},
  putItem() {},
  updateItem() {},
  query() {},
};

const web3 = {
  eth: {
    contract() {},
  },
  at() {},
};

const contract = {
  getLineup: {
    call() {},
  },
  smallBlind: {
    call() {},
  },
};

const pusher = {
  trigger: function(){}
};

const rc = new ReceiptCache();
sinon.stub(web3.eth, 'contract').returns(web3);
sinon.stub(web3, 'at').returns(contract);

describe('Oracle pay', () => {
  it('should reject receipt with unknown hand Ids.', (done) => {
    sinon.stub(dynamo, 'getItem').yields(null, {});
    sinon.stub(dynamo, 'query').yields(null, { Items: [{ handId: 1 }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    const blind = new EWT(ABI_BET).bet(2, 100).sign(P1_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('currently playing 1');
      done();
    }).catch(done);
  });

  it('should prevent small blind from player not in lineup.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [0, [P2_ADDR, P3_ADDR], [50000, 50000], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      state: 'waiting',
      handId: 1,
      dealer: 0,
      lineup: [{
        address: P2_ADDR,
      }, {
        address: P3_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const blind = new EWT(ABI_BET).bet(1, 50).sign(P1_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('Forbidden');
      done();
    }).catch(done);
  });

  it('should prevent SB from leaving player.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [new BigNumber(1),
      [P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000)],
      [bn0, bn0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      state: 'waiting',
      handId: 3,
      dealer: 1,
      sb: 50,
      lineup: [{
        address: EMPTY_ADDR,
      }, {
        address: P2_ADDR,
        exitHand: 2,
      }, {
        address: P3_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const blind = new EWT(ABI_BET).bet(3, 50).sign(P2_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('Forbidden: exitHand 2 exceeded.');
      done();
    }).catch(done);
  });

  it('should prevent BB from leaving player.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [new BigNumber(1),
      [P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000)],
      [bn0, bn0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      state: 'dealing',
      handId: 3,
      dealer: 2,
      sb: 50,
      lineup: [{
        address: EMPTY_ADDR,
      }, {
        address: P2_ADDR,
        exitHand: 2,
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(3, 50).sign(P3_KEY),
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const blind = new EWT(ABI_BET).bet(3, 100).sign(P2_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('Forbidden: exitHand 2 exceeded.');
      done();
    }).catch(done);
  });

  it('should prevent game with less than 2 players.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, EMPTY_ADDR],
      [new BigNumber(50000), bn0],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      state: 'waiting',
      handId: 1,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: EMPTY_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const blind = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('not enough players');
      done();
    }).catch(done);
  });

  it('should prevent blind with wrong value.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      state: 'waiting',
      handId: 1,
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const blind = new EWT(ABI_BET).bet(1, 80).sign(P1_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('small blind not valid');
      done();
    }).catch(done);
  });

  it('should check position for small blind with 2 players.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 1,
      sb: 50,
      state: 'waiting',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const smallBlind = new EWT(ABI_BET).bet(1, 50).sign(P1_KEY);
    oracle.pay(tableAddr, smallBlind).catch((err) => {
      expect(err.message).to.contain('not your turn');
      done();
    }).catch(done);
  });

  it('should check position for small blind with 2 players.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, EMPTY_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [bn0, bn0, bn0]]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 1,
      sb: 50,
      state: 'waiting',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
      }, {
        address: EMPTY_ADDR,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const smallBlind = new EWT(ABI_BET).bet(1, 50).sign(P2_KEY);
    oracle.pay(tableAddr, smallBlind).then(() => {
      done();
    }).catch(done);
  });

  it('should allow to play small blind with 3+ players.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      sb: 50,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
      }, {
        address: P3_ADDR,
      }],
      state: 'waiting',
      deck,
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const smallBlind = new EWT(ABI_BET).bet(1, 50).sign(P2_KEY);
    oracle.pay(tableAddr, smallBlind).then((rsp) => {
      expect(rsp.cards.length).to.eql(2);
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'dealing')));
      done();
    }).catch(done);
  });

  it('should allow to play big blind with 3+ players.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      sb: 50,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
      }],
      deck,
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet3 = new EWT(ABI_BET).bet(1, 100).sign(P3_KEY);
    oracle.pay(tableAddr, bet3).then((rsp) => {
      expect(rsp.cards.length).to.eql(2);
      done();
    }).catch(done);
  });

  it('should keed state dealing while 0 receipts submitted.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR, P4_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      dealer: 0,
      handId: 1,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P3_KEY),
      }, {
        address: P4_ADDR,
      }],
      deck,
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet4 = new EWT(ABI_BET).bet(1, 0).sign(P4_KEY);
    oracle.pay(tableAddr, bet4).then((rsp) => {
      expect(rsp.cards.length).to.eql(2);
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'dealing')));
      done();
    }).catch(done);
  });

  it('should set state preflop after last 0 receipts.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      dealer: 3,
      handId: 1,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P1_KEY),
      }, {
        address: EMPTY_ADDR,
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 0).sign(P3_KEY),
      }, {
        address: P4_ADDR,
      }],
      deck,
    }] });
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR, P4_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet4 = new EWT(ABI_BET).bet(1, 0).sign(P4_KEY);
    oracle.pay(tableAddr, bet4).then((rsp) => {
      expect(rsp.cards.length).to.eql(2);
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'preflop')));
      done();
    }).catch(done);
  });

  it('should prevent big blind from not in lineup.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      lineup: [{ address: '0x1256' }, { address: '0x1234' }],
    }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    const blind = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('Forbidden');
      done();
    }).catch(done);
  });

  it('should prevent big blind too small.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      state: 'dealing',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P1_KEY),
      }, {
        address: P2_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    const bigBlind = new EWT(ABI_BET).bet(1, 80).sign(P2_KEY);
    oracle.pay(tableAddr, bigBlind).catch((err) => {
      expect(err.message).to.contain('not valid');
      done();
    }).catch(done);
  });

  it('should keep preflop until BB checked.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(1),
      [P1_ADDR, P2_ADDR, P3_ADDR],
      [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)],
      [0, 0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      sb: 50,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P3_KEY),
      }],
      state: 'preflop',
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, bet).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'preflop')));
      done();
    }).catch(done);
  });

  it('should proceed to flop when BB gave checkPre.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(1),
      [P1_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      sb: 50,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P2_KEY),
      }],
      state: 'preflop',
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const pfCheck = new EWT(ABI_CHECK_PRE).checkPre(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, pfCheck).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':m', 100)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('UpdateExpression', 'set lineup[1] = :l, #hand_state = :s, changed = :c, preMaxBet = :m'));
      done();
    }).catch(done);
  });

  it('should allow to pay big blind.', (done) => {
    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      handId: 2,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(2, 10000).sign(P2_KEY),
      }],
      distribution: new EWT(ABI_DIST).distribution(2, 0, [EWT.concat(P2_ADDR, 2000).toString('hex')]).sign(P1_KEY),
    } });
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      sb: 50,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 50).sign(P1_KEY),
      }, {
        address: P2_ADDR,
      }],
      deck,
      state: 'dealing',
      dealer: 0,
    }] });
    sinon.stub(contract.getLineup, 'call').yields(null, [new BigNumber(1), [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bigBlind = new EWT(ABI_BET).bet(3, 100).sign(P2_KEY);
    oracle.pay(tableAddr, bigBlind).then((rsp) => {
      expect(rsp).to.eql({
        cards: [2, 3],
      });
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'preflop')));
      done();
    }).catch(done);
  });

  it('should prevent betting more than balance.', (done) => {
    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(2, 10000).sign(P2_KEY),
      }],
      distribution: new EWT(ABI_DIST).distribution(1, 0, [
        EWT.concat(P1_ADDR, 20000).toString('hex'),
      ]).sign(P1_KEY),
    } });
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 0).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(3, 0).sign(P2_KEY),
      }],
      state: 'flop',
      dealer: 0,
    }] });
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(25000)],
      [0, 0],
    ]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet = new EWT(ABI_BET).bet(3, 10000).sign(P2_KEY);
    oracle.pay(tableAddr, bet).catch((err) => {
      expect(err.message).to.contain('can not bet more than balance');
      done();
    }).catch(done);
  });

  it('should prevent betting more than balance in same hand.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P2_KEY),
      }],
      state: 'flop',
      dealer: 0,
    }] });
    const lineup = [
      new BigNumber(1),
      [P1_ADDR, P2_ADDR],
      [new BigNumber(500), new BigNumber(150)],
      [0, 0],
    ];
    sinon.stub(contract.getLineup, 'call').yields(null, lineup);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const tooMuchBet = new EWT(ABI_BET).bet(1, 200).sign(P2_KEY);
    oracle.pay(tableAddr, tooMuchBet).catch((err) => {
      expect(err.message).to.contain('can not bet more than balance');
      done();
    }).catch(done);
  });

  it('should prevent reusing receipts.', (done) => {
    const blind = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      lineup: [{ address: P1_ADDR }, { address: P2_ADDR, last: blind }],
    }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.pay(tableAddr, blind).catch((err) => {
      expect(err.message).to.contain('Unauthorized');
      done();
    }).catch(done);
  });

  it('should allow to fold.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P3_KEY),
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const fold = new EWT(ABI_FOLD).fold(1, 50).sign(P2_KEY);
    oracle.pay(tableAddr, fold).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P2_ADDR,
        last: fold,
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should allow to go all in.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      state: 'flop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P3_KEY),
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P2_ADDR], [new BigNumber(1000), new BigNumber(100), new BigNumber(1000)], [bn0, bn0, bn0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const allin = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, allin).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P2_ADDR,
        last: allin,
        sitout: 'allin',
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      done();
    }).catch(done);
  });

  it('should allow to call-in heads up and go to showdown.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      state: 'flop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: EMPTY_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        sitout: 1,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, EMPTY_ADDR, P2_ADDR, P3_ADDR],
      [new BigNumber(1000), bn0, new BigNumber(100), new BigNumber(1000)],
      [bn0, bn0, bn0, bn0],
    ]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const allin = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, allin).then(() => {
      const seat = {
        address: P2_ADDR,
        last: allin,
        sitout: 'allin',
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'showdown')));
      done();
    }).catch(done);
  });

  it('should advance to showdown when last active player calls all-in.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      state: 'flop',
      dealer: 1,
      lineup: [{
        address: EMPTY_ADDR,
      }, {
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P1_KEY),
      }, {
        address: P4_ADDR,
        sitout: 1,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(3, 1000).sign(P2_KEY),
        sitout: 'allin',
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(2),
      [EMPTY_ADDR, P1_ADDR, P4_ADDR, P2_ADDR],
      [bn0, new BigNumber(2000), new BigNumber(2000), new BigNumber(1000)],
      [bn0, bn0, bn0, bn0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const call = new EWT(ABI_BET).bet(3, 1000).sign(P1_KEY);
    oracle.pay(tableAddr, call).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P1_ADDR,
        last: call,
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'showdown')));
      done();
    }).catch(done);
  });

  it('should allow to call-in.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      state: 'turn',
      dealer: 2,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 1400).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(3, 800).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(3, 800).sign(P3_KEY),
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(2),
      [P1_ADDR, P2_ADDR, P3_ADDR],
      [new BigNumber(2000), new BigNumber(1000), new BigNumber(2000)],
      [bn0, bn0, bn0],
    ]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const callIn = new EWT(ABI_BET).bet(3, 1000).sign(P2_KEY);
    oracle.pay(tableAddr, callIn).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P2_ADDR,
        last: callIn,
        sitout: 'allin',
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'turn')));
      done();
    }).catch(done);
  });

  it('should allow to sitout in state waiting.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      state: 'waiting',
      lineup: [{ address: P1_ADDR }, { address: P2_ADDR }, { address: P3_ADDR }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const sitout = new EWT(ABI_SIT_OUT).sitOut(1, 0).sign(P3_KEY);
    oracle.pay(tableAddr, sitout).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P3_ADDR,
        sitout: sinon.match.any,
        last: sitout };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should allow 0 sitout in dealing.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const sitout = new EWT(ABI_SIT_OUT).sitOut(1, 0).sign(P3_KEY);
    oracle.pay(tableAddr, sitout).then(() => {
      const seat = {
        address: P3_ADDR,
        sitout: sinon.match.any,
        last: sitout };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should allow to sitout if BB.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const sitout = new EWT(ABI_SIT_OUT).sitOut(1, 1).sign(P3_KEY);
    oracle.pay(tableAddr, sitout).then((rsp) => {
      expect(rsp).to.eql({});
      const seat = {
        address: P3_ADDR,
        sitout: sinon.match.any,
        last: sitout };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should prevent sitout toggle in same hand.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 13,
      dealer: 0,
      sb: 50,
      state: 'dealing',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_SIT_OUT).sitOut(13, 0).sign(P1_KEY),
        sitout: 1,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(13, 50).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(13, 100).sign(P2_KEY),
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    sinon.stub(contract.getLineup, 'call').yields(null, [new BigNumber(12), [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const sitout = new EWT(ABI_SIT_OUT).sitOut(13, 100).sign(P1_KEY);
    oracle.pay(tableAddr, sitout).catch((err) => {
      expect(err.message).to.contain('can not toggle sitout');
      done();
    }).catch(done);
  });

  it('should switch to flop after fold when remaining pl. are even', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 3,
      sb: 50,
      state: 'preflop',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 150).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 150).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P3_KEY),
      }, {
        address: P4_ADDR,
        last: new EWT(ABI_FOLD).fold(1, 0).sign(P4_KEY),
      }],
    }] });
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR, P4_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const fold3 = new EWT(ABI_FOLD).fold(1, 100).sign(P3_KEY);
    oracle.pay(tableAddr, fold3).then((rsp) => {
      expect(rsp).to.eql({});
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      done();
    }).catch(done);
  });

  it('should prevent bet after fold.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      state: 'preflop',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 200).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 200).sign(P3_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_FOLD).fold(1, 100).sign(P2_KEY),
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    const bet = new EWT(ABI_BET).bet(1, 200).sign(P2_KEY);
    oracle.pay(tableAddr, bet).catch((err) => {
      expect(err.message).to.contain('no bet after fold.');
      done();
    }).catch(done);
  });

  it('should prevent bet during sitout.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      state: 'flop',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 200).sign(P1_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 200).sign(P3_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_SIT_OUT).sitOut(1, 100).sign(P2_KEY),
        sitout: 1,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    const bet = new EWT(ABI_BET).bet(1, 200).sign(P2_KEY);
    oracle.pay(tableAddr, bet).catch((err) => {
      expect(err.message).to.contain('Bad Request: wait for next hand');
      done();
    }).catch(done);
  });

  it('should prevent check during wrong state.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 3,
      state: 'flop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P2_KEY),
      }],
    }] });

    const check = new EWT(ABI_CHECK_TURN).checkTurn(3, 100).sign(P2_KEY);
    new Oracle(new Db(dynamo), null, rc).pay(tableAddr, check).catch((err) => {
      expect(err.message).to.contain('checkTurn only during turn');
      done();
    }).catch(done);
  });

  it('should allow to come back from sitout in waiting.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      sb: 50,
      state: 'waiting',
      dealer: 1,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: EMPTY_ADDR,
      }, {
        address: P2_ADDR,
        sitout: 1,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet = new EWT(ABI_SIT_OUT).sitOut(1, 0).sign(P2_KEY);
    oracle.pay(tableAddr, bet).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'waiting')));
      const seat = { address: P2_ADDR, last: bet };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should allow to come back from sitout in waiting with 3 players.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, P2_ADDR, P3_ADDR],
      [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)],
      [0, 0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      sb: 50,
      state: 'waiting',
      dealer: 2,
      lineup: [{
        address: P1_ADDR,
      }, {
        address: P2_ADDR,
        sitout: 1,
      }, {
        address: P3_ADDR,
        sitout: 1,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bet = new EWT(ABI_SIT_OUT).sitOut(1, 0).sign(P2_KEY);
    oracle.pay(tableAddr, bet).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'waiting')));
      const seat = { address: P2_ADDR, last: bet };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should allow to come back from sitout by paying sitout receipt > 0.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      bn0,
      [P1_ADDR, P2_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      sb: 50,
      state: 'flop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 150).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        sitout: 1,
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(1, 250).sign(P1_KEY),
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const action = new EWT(ABI_SIT_OUT).sitOut(1, 1).sign(P2_KEY);
    oracle.pay(tableAddr, action).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      const seat = {
        address: P2_ADDR,
        last: action,
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  it('should prevent to come back from sitout after waiting without paying.', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(1),
      [P1_ADDR, P2_ADDR, P2_ADDR],
      [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      sb: 50,
      state: 'preflop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 50).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        sitout: 1,
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P1_KEY),
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const action = new EWT(ABI_SIT_OUT).sitOut(3, 0).sign(P2_KEY);
    oracle.pay(tableAddr, action).catch((err) => {
      expect(err.message).to.contain('have to pay');
      done();
    });
  });

  it('should prevent check to raise.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 3,
      state: 'flop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(3, 100).sign(P2_KEY),
      }],
    }] });

    const check = new EWT(ABI_CHECK_FLOP).checkFlop(3, 120).sign(P2_KEY);
    new Oracle(new Db(dynamo), null, rc).pay(tableAddr, check).catch((err) => {
      expect(err.message).to.contain('check should not raise');
      done();
    }).catch(done);
  });

  it('should allow to deal.', (done) => {
    const smallBlind = new EWT(ABI_BET).bet(1, 50).sign(P2_KEY);
    const bigBlind = new EWT(ABI_BET).bet(1, 100).sign(P3_KEY);

    const lineup = [
      { address: P1_ADDR },
      { address: P2_ADDR, last: smallBlind },
      { address: P3_ADDR, last: bigBlind },
    ];
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      lineup,
      state: 'dealing',
      deck,
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc);

    const zeroBlind = new EWT(ABI_BET).bet(1, 0).sign(P1_KEY);

    oracle.pay(tableAddr, zeroBlind).then((rsp) => {
      expect(rsp.cards.length).to.eql(2);
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'preflop')));
      done();
    }).catch(done);
  });

  it('should allow to deal with sitout', (done) => {
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      state: 'dealing',
      sb: 50,
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 50).sign(P1_KEY),
      }, {
        address: P2_ADDR,
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_SIT_OUT).sitOut(1, 0).sign(P3_KEY),
        sitout: 1,
      }],
      deck,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const bigBlind = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    oracle.pay(tableAddr, bigBlind).then((rsp) => {
      expect(rsp).to.eql({
        cards: [2, 3],
      });
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'preflop')));
      done();
    }).catch(done);
  });

  it('should allow to check', (done) => {
    const check1 = new EWT(ABI_CHECK_FLOP).checkFlop(1, 150).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 150).sign(P2_KEY);
    const bet3 = new EWT(ABI_BET).bet(1, 150).sign(P3_KEY);
    const lineup = [
      { address: P1_ADDR, last: check1 },
      { address: P2_ADDR, last: bet2 },
      { address: P3_ADDR, last: bet3 },
    ];
    const check2 = new EWT(ABI_CHECK_FLOP).checkFlop(1, 150).sign(P2_KEY);
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      lineup,
      state: 'flop',
      deck,
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    oracle.pay(tableAddr, check2).then((rsp) => {
      expect(rsp).to.eql({
        cards: [2, 3],
      });
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      done();
    }).catch(done);
  });

  it('should allow to check multiple rounds', (done) => {
    const check1 = new EWT(ABI_CHECK_FLOP).checkFlop(1, 150).sign(P1_KEY);
    const check2 = new EWT(ABI_CHECK_TURN).checkTurn(1, 150).sign(P2_KEY);
    const check3 = new EWT(ABI_CHECK_FLOP).checkFlop(1, 150).sign(P3_KEY);
    const lineup = [
      { address: P1_ADDR, last: check1 },
      { address: P2_ADDR, last: check2 },
      { address: P3_ADDR, last: check3 },
    ];
    const check3a = new EWT(ABI_CHECK_TURN).checkTurn(1, 150).sign(P3_KEY);
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 1,
      lineup,
      state: 'turn',
      deck,
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    oracle.pay(tableAddr, check3a).then((rsp) => {
      expect(rsp).to.eql({
        cards: [4, 5],
      });
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'turn')));
      done();
    }).catch(done);
  });

  it('should allow to flop with sitout', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [new BigNumber(12), [P1_ADDR, P2_ADDR, P3_ADDR], [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 13,
      sb: 50,
      state: 'preflop',
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(13, 150).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(13, 200).sign(P2_KEY),
      }, {
        address: P3_ADDR,
        last: new EWT(ABI_SIT_OUT).sitOut(13, 0).sign(P3_KEY),
        sitout: 1,
      }],
      deck,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const call = new EWT(ABI_BET).bet(13, 200).sign(P1_KEY);
    oracle.pay(tableAddr, call).then((rsp) => {
      expect(rsp).to.eql({
        cards: [0, 1],
      });
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'flop')));
      done();
    }).catch(done);
  });

  it('should prevent playing lower bet.', (done) => {
    sinon.stub(contract.smallBlind, 'call').yields(null, new BigNumber(50));
    sinon.stub(contract.getLineup, 'call').yields(null, [
      new BigNumber(1),
      [P1_ADDR, P2_ADDR, P3_ADDR],
      [new BigNumber(50000), new BigNumber(50000), new BigNumber(50000)],
      [0, 0],
    ]);
    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      handId: 2,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(2, 50).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(2, 100).sign(P2_KEY),
      }],
      state: 'turn',
      deck,
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc);

    const lowBet = new EWT(ABI_BET).bet(2, 60).sign(P1_KEY);
    oracle.pay(tableAddr, lowBet).catch((err) => {
      expect(err.message).to.contain('Unauthorized');
      expect(err.message).to.contain('match or raise');
      done();
    }).catch(done);
  });

  it('should keep hand state if game ends.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 50).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);

    const lineup = [
      { address: P1_ADDR, last: bet1 },
      { address: P2_ADDR, last: bet2 },
    ];

    sinon.stub(dynamo, 'query').yields(null, []).onFirstCall().yields(null, { Items: [{
      lineup,
      handId: 1,
      state: 'turn',
      deck,
      dealer: 0,
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc, ORACLE_PRIV);

    const fold = new EWT(ABI_FOLD).fold(1, 50).sign(P1_KEY);

    oracle.pay(tableAddr, fold).then(() => {
      const seat = { address: P1_ADDR, last: fold };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', 'turn')));
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (contract.getLineup.call.restore) contract.getLineup.call.restore();
    if (contract.smallBlind.call.restore) contract.smallBlind.call.restore();
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.putItem.restore) dynamo.putItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
    if (dynamo.query.restore) dynamo.query.restore();
  });
});

describe('Oracle info', () => {
  it('should allow to get uninitialized info.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr, tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        dealer: 0,
        distribution: '0x1234',
        handId: 0,
        state: 'showdown',
      });
      done();
    }).catch(done);
  });

  it('should not return uninitialized info from unknown tables.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr, 'tablex,table').catch((err) => {
      expect(err.message).to.contain('Not Found:');
      done();
    }).catch(done);
  });

  it('should allow to get preflop info.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 0,
      deck,
      dealer: 0,
      sb: 50,
      lineup: [],
      changed: 123,
      state: 'preflop',
    }] });

    new Oracle(new Db(dynamo)).info(tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        handId: 0,
        cards: [],
        dealer: 0,
        sb: 50,
        lineup: [],
        changed: 123,
        state: 'preflop',
      });
      done();
    }).catch(done);
  });

  it('should allow to get flop info.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 0,
      dealer: 0,
      sb: 50,
      deck,
      lineup: [],
      changed: 123,
      preMaxBet: 200,
      state: 'flop',
    }] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22],
        dealer: 0,
        sb: 50,
        lineup: [],
        changed: 123,
        preMaxBet: 200,
        state: 'flop',
      });
      done();
    }).catch(done);
  });

  it('should allow to get turn info.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 0,
      dealer: 0,
      sb: 50,
      deck,
      lineup: [],
      changed: 123,
      preMaxBet: 200,
      flopMaxBet: 300,
      state: 'turn',
    }] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23],
        dealer: 0,
        sb: 50,
        lineup: [],
        changed: 123,
        preMaxBet: 200,
        flopMaxBet: 300,
        state: 'turn',
      });
      done();
    }).catch(done);
  });

  it('should allow to get river info.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 0,
      dealer: 0,
      sb: 50,
      deck,
      lineup: [],
      changed: 123,
      preMaxBet: 200,
      flopMaxBet: 300,
      turnMaxBet: 400,
      state: 'river',
    }] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23, 24],
        dealer: 0,
        sb: 50,
        lineup: [],
        changed: 123,
        preMaxBet: 200,
        flopMaxBet: 300,
        turnMaxBet: 400,
        state: 'river',
      });
      done();
    }).catch(done);
  });

  it('should allow to get showdown info.', (done) => {
    const show1 = new EWT(ABI_SHOW).show(0, 50).sign(P1_KEY);
    const muck2 = new EWT(ABI_FOLD).fold(0, 50).sign(P2_KEY);
    const lineup = [
      { address: P1_ADDR, last: show1 },
      { address: P2_ADDR, last: muck2 },
    ];

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 0,
      dealer: 0,
      sb: 50,
      deck,
      lineup,
      changed: 123,
      preMaxBet: 200,
      flopMaxBet: 300,
      turnMaxBet: 400,
      riverMaxBet: 500,
      distribution: 'dist',
      state: 'showdown',
    }] });

    new Oracle(new Db(dynamo), null, rc).info(tableAddr).then((rsp) => {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23, 24],
        dealer: 0,
        sb: 50,
        lineup: [{
          address: P1_ADDR,
          cards: [0, 1],
          last: show1,
        }, {
          address: P2_ADDR,
          last: muck2,
        }],
        changed: 123,
        preMaxBet: 200,
        flopMaxBet: 300,
        turnMaxBet: 400,
        riverMaxBet: 500,
        distribution: 'dist',
        state: 'showdown',
      });
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.query.restore) dynamo.query.restore();
  });
});

describe('Oracle get Hand', () => {
  it('should allow to get hand.', (done) => {
    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      state: 'river',
      lineup: [],
      distribution: 'dist',
      deck,
    } });

    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.getHand(tableAddr, '1').then((rsp) => {
      expect(rsp.distribution).to.eql('dist');
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.getItem.restore) dynamo.getItem.restore();
  });
});


describe('Oracle show', () => {
  it('should prevent show before showdown', (done) => {
    const show1 = new EWT(ABI_SHOW).show(1, 100).sign(P1_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      state: 'river',
      deck,
    } });

    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.show(tableAddr, show1, [0, 1]).catch((err) => {
      expect(err.message).to.contain('not in showdown');
      done();
    }).catch(done);
  });

  it('should prevent bet in showdown', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    const lineup = [
      { address: P1_ADDR, last: bet1 },
      { address: P2_ADDR, last: bet2 },
    ];
    const bet = new EWT(ABI_BET).bet(1, 200).sign(P1_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup,
      state: 'showdown',
      deck,
    } });
    const oracle = new Oracle(new Db(dynamo), null, rc);

    try {
      oracle.show(tableAddr, bet, [0, 1]);
    } catch (err) {
      expect(err.message).to.contain('only "show" and "muck" receipts');
      done();
    }
    throw new Error('should have thrown');
  });

  it('should allow to showdown with 1 winner.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    const lineup = [
      { address: P1_ADDR, last: bet1 },
      { address: P2_ADDR, last: bet2 },
    ];

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup,
      state: 'showdown',
      deck: [12, 11, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 1, 0, 13, 14, 15, 22, 17, 18, 19, 20, 21, 36, 23, 24, 25],
    } });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc, ORACLE_PRIV);

    const show = new EWT(ABI_SHOW).show(1, 100).sign(P1_KEY);

    oracle.show(tableAddr, show, [12, 11]).then(() => {
      const trueIsh = sinon.match((value) => {
        const p = value.ExpressionAttributeValues[':l'];
        return (p.cards[0] === 12 && p.cards[1] === 11 && p.last === show);
      }, 'trueIsh');
      expect(dynamo.updateItem).calledWith(sinon.match(trueIsh));
      done();
    }).catch(done);
  });

  it('should allow to show for all-in player.', (done) => {
    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
        sitout: 'allin',
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P2_KEY),
      }],
      state: 'showdown',
      deck: [12, 11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 0,
        13, 14, 15, 22, 17, 18, 19, 20, 21, 36, 23, 24, 25],
    } });
    sinon.stub(dynamo, 'updateItem').yields(null, {});
    const oracle = new Oracle(new Db(dynamo), null, rc, ORACLE_PRIV);

    const show = new EWT(ABI_SHOW).show(1, 100).sign(P1_KEY);
    oracle.show(tableAddr, show, [12, 11]).then(() => {
      const trueIsh = sinon.match((value) => {
        const p = value.ExpressionAttributeValues[':l'];
        return (p.cards[0] === 12 && p.cards[1] === 11 && p.last === show && !p.sitout);
      }, 'trueIsh');
      expect(dynamo.updateItem).calledWith(sinon.match(trueIsh));
      done();
    }).catch(done);
  });

  it('should prevent show by timedout player.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    const bet3 = new EWT(ABI_BET).bet(1, 50).sign(P3_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup: [{
        address: P1_ADDR,
        last: bet1,
      }, {
        address: P2_ADDR,
        last: bet2,
      }, {
        address: P3_ADDR,
        last: bet3,
        sitout: 'timeout',
      }],
      state: 'showdown',
      deck,
    } });

    const show = new EWT(ABI_SHOW).show(1, 100).sign(P3_KEY);
    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.show(tableAddr, show, [4, 5]).catch((err) => {
      expect(err.message).to.contain('not allowed in showdown');
      done();
    }).catch(done);
  });

  it('should prevent show with smaller amount.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup: [{
        address: P1_ADDR,
        last: bet1,
      }, {
        address: P2_ADDR,
        last: bet2,
      }],
      state: 'showdown',
      deck,
    } });

    const show = new EWT(ABI_SHOW).show(1, 20).sign(P2_KEY);
    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.show(tableAddr, show, [4, 5]).catch((err) => {
      expect(err.message).to.contain('same or highter amount');
      done();
    }).catch(done);
  });

  it('should prevent show by folded player.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    const fold = new EWT(ABI_FOLD).fold(1, 50).sign(P3_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup: [{
        address: P1_ADDR,
        last: bet1,
      }, {
        address: P2_ADDR,
        last: bet2,
      }, {
        address: P3_ADDR,
        last: fold,
      }],
      state: 'showdown',
      deck,
    } });

    const show = new EWT(ABI_SHOW).show(1, 100).sign(P3_KEY);
    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.show(tableAddr, show, [4, 5]).catch((err) => {
      expect(err.message).to.contain('is not an active player');
      done();
    }).catch(done);
  });

  it('should allow to showdown with 2 winners.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);
    const bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    const lineup = [
      { address: P1_ADDR, last: bet1 },
      { address: P2_ADDR, last: bet2 },
    ];

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup,
      state: 'showdown',
      deck,
    } });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc, ORACLE_PRIV);

    const show = new EWT(ABI_SHOW).show(1, 100).sign(P1_KEY);

    oracle.show(tableAddr, show, [0, 1]).then(() => {
      const seat = { address: P1_ADDR, last: show, cards: [0, 1] };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', seat)));
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
  });
});

describe('Oracle leave', () => {
  it('should prevent leaving in completed hand.', (done) => {
    const leave = new EWT(ABI_LEAVE).leave(2, 0).sign(P1_KEY);
    const lineup = [{ address: P1_ADDR }, { address: P2_ADDR }];

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      state: 'flop',
      lineup,
    }] });

    const oracle = new Oracle(new Db(dynamo), null, rc);

    oracle.leave(tableAddr, leave).catch((err) => {
      expect(err.message).to.contain('forbidden');
      done();
    }).catch(done);
  });

  it('should allow to leave in next hand.', (done) => {
    const leave = new EWT(ABI_LEAVE).leave(2, 0).sign(P1_KEY);
    const lineup = [{ address: P1_ADDR }, { address: P2_ADDR }];

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      state: 'flop',
      lineup,
    }] });
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc, ORACLE_PRIV);

    oracle.leave(tableAddr, leave).then(() => {
      const seat = {
        address: P1_ADDR,
        exitHand: 2,
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', seat)));
      done();
    }).catch(done);
  });

  it('should allow to leave in previous hand, if this hand hasn\'t started.', (done) => {
    const leave = new EWT(ABI_LEAVE).leave(2, 0).sign(P1_KEY);
    const lineup = [{ address: P1_ADDR }, { address: P2_ADDR }];

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 3,
      state: 'waiting',
      lineup,
    }] });
    sinon.stub(contract.getLineup, 'call').yields(null, [bn0, [P1_ADDR, P2_ADDR], [new BigNumber(50000), new BigNumber(50000)], [0, 0]]);
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), new TableContract(web3), rc, ORACLE_PRIV);

    oracle.leave(tableAddr, leave).then(() => {
      const seat = {
        address: P1_ADDR,
        exitHand: 2,
        sitout: 1,
      };
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', seat)));
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.query.restore) dynamo.query.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
    if (contract.getLineup.call.restore) contract.getLineup.call.restore();
  });
});

describe('Oracle netting', () => {
  it('should allow to deliver netting.', (done) => {
    const lineup = [{ address: P1_ADDR }, { address: P2_ADDR }, { address: P4_ADDR }];

    const netting = {
      newBalances: '0x000000025b96c8e5858279b31f644501a140e8a7000000000000000082e8c6cf42c8d1ff9594b17a3f50e94a12cc860f000000000000e86cf3beac30c498d9e26865f34fcaa57dbb935b0d740000000000009e34e10f3d125e5f4c753a6456fc37123cf17c6900f2',
    };
    const nettingSig = '0x306f6bc2348440582ca694d4998b082d3b77ad25b62fcf2f22e526a14e50ecf45bdb61d92d77bce6b5c7bce2800ddda525af1622af6b3d6f918993431fff18551c';

    sinon.stub(dynamo, 'getItem').yields(null, { Item: {
      lineup,
      netting,
    } });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc);


    oracle.netting(tableAddr, 2, nettingSig).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':s', nettingSig)));
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
  });
});

describe('Oracle timing', () => {
  it('should not timeout if time not up.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      changed: Math.floor(Date.now() / 1000) - 20,
      lineup: [{
        address: P1_ADDR,
        last: bet1,
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P2_KEY),
      }],
    }] });

    const oracle = new Oracle(new Db(dynamo), null, rc);
    oracle.timeout(tableAddr).catch((err) => {
      expect(err.message).to.contain('second to act');
      done();
    }).catch(done);
  });

  it('should allow to put player into sitout.', (done) => {
    const bet1 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);

    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      state: 'flop',
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 150).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: bet1,
      }],
    }] });
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    const oracle = new Oracle(new Db(dynamo), null, rc);
    oracle.timeout(tableAddr).then(() => {
      expect(dynamo.updateItem).calledWith(sinon.match.has('ExpressionAttributeValues', sinon.match.has(':l', {
        address: P2_ADDR,
        last: bet1,
        sitout: sinon.match.number,
      })));
      done();
    }).catch(done);
  });

  it('should handle sitout on hand state complete.', (done) => {
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      handId: 1,
      dealer: 0,
      lineup: [{
        address: P1_ADDR,
        last: new EWT(ABI_BET).bet(1, 100).sign(P1_KEY),
      }, {
        address: P2_ADDR,
        last: new EWT(ABI_FOLD).fold(1, 50).sign(P2_KEY),
      }],
    }] });

    const oracle = new Oracle(new Db(dynamo), null, rc);
    oracle.timeout(tableAddr).catch((err) => {
      expect(err.message).to.contain('Bad Request');
      done();
    }).catch(done);
  });

  afterEach(() => {
    if (dynamo.query.restore) dynamo.query.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
  });
});

describe('Oracle messaging', () => {
  it('allow to post message.', (done) => {
    const msgReceipt = new Receipt(tableAddr).message('testMsg').sign(P1_KEY);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      lineup: [{
        address: P1_ADDR,
      }, {
        address: EMPTY_ADDR,
      }],
    }] });
    sinon.stub(pusher, 'trigger').returns(null);
    const oracle = new Oracle(new Db(dynamo), null, null, null, pusher);
    oracle.handleMessage(msgReceipt).then(() => {
      expect(pusher.trigger).callCount(1);
      expect(pusher.trigger).calledWith(tableAddr, 'update', msgReceipt);
      done();
    }).catch(done);
  });

  it('prevent invalid messages.', () => {
    const invalidReceipt = 'KQ10.iSuPOR8qKErzme54FxE+IvyLrcy46rP2w/fbxVtLuEA=';
    try {
      new Oracle().handleMessage(invalidReceipt);
    } catch (err) {
      expect(err.message).to.contain('Unauthorized: invalid message');
      return;
    }
    throw new Error('should have thrown');
  });

  it('prevent non-message receipts.', () => {
    const rakeReq = new Receipt(tableAddr).rakeRequest(17).sign(P1_KEY);
    try {
      new Oracle().handleMessage(rakeReq);
    } catch (err) {
      expect(err.message).to.contain('Bad Request: receipt type');
      return;
    }
    throw new Error('should have thrown');
  });

  it('prevent message signer not in lineup.', (done) => {
    const msgReceipt = new Receipt(tableAddr).message('testMsg').sign(P1_KEY);
    sinon.stub(dynamo, 'query').yields(null, { Items: [{
      lineup: [{
        address: P2_ADDR,
      }, {
        address: EMPTY_ADDR,
      }],
    }] });
    const oracle = new Oracle(new Db(dynamo));

    oracle.handleMessage(msgReceipt).catch((err) => {
      expect(err.message).to.contain(`Forbidden: address ${P1_ADDR} not in lineup.`);
      done();
    }).catch(done);;
  });

  afterEach(() => {
    if (pusher.trigger.restore) pusher.trigger.restore();
    if (dynamo.query.restore) dynamo.query.restore();
  });
});
