var expect = require('chai').expect;
var sinon = require('sinon');
require('chai').use(require('sinon-chai'));
const EWT = require('ethereum-web-token');
var BigNumber = require('bignumber.js');

const Oracle = require('./lib/index');
const Db = require('./lib/db');
const Contract = require('./lib/blockchain');

const ABI_BET = [{name: 'bet', type: 'function', inputs: [{type: 'uint112'}, {type: 'uint136'}]}];
const ABI_SHOW = [{name: 'show', type: 'function', inputs: [{type: 'uint112'}, {type: 'uint136'}]}];
const ABI_MUCK = [{name: 'muck', type: 'function', inputs: [{type: 'uint112'}, {type: 'uint136'}]}];

const P1_ADDR = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74';
const P1_KEY = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

//secretSeed: 'brother mad churn often amount wing pretty critic rhythm man insane ridge' }
const P2_ADDR = '0xe10f3d125e5f4c753a6456fc37123cf17c6900f2';
const P2_KEY = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';

//secretSeed: 'erosion warm student north injury good evoke river despair critic wrestle unveil' }
const P3_ADDR = '0xc3ccb3902a164b83663947aff0284c6624f3fbf2';
const P3_KEY = '0x71d2b12dad610fc929e0596b6e887dfb711eec286b7b8b0bdd742c0421a9c425';

//secretSeed: 'erode melody nature bounce sample deny spend give craft alcohol supply roof' }
const P4_ADDR = '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f';
const P4_KEY = '0x94890218f2b0d04296f30aeafd13655eba4c5bbf1770273276fee52cbe3f2cb4';

const tableAddr = '0x123';

const deck = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]

var dynamo = {
  getItem: function(){},
  putItem: function(){},
  updateItem: function(){},
  query: function(){}
};

var provider = {
  getTable: function(){}
}

var contract = {
  lineup: function(){},
  params: function(){}
}

describe('Oracle pay', function() {

  beforeEach(function () {
    sinon.stub(provider, 'getTable').returns(contract);
  });

  afterEach(function () {
    if (contract.lineup.restore) contract.lineup.restore();
    if (contract.params.restore) contract.params.restore();
    if (provider.getTable.restore) provider.getTable.restore();
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.putItem.restore) dynamo.putItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
    if (dynamo.query.restore) dynamo.query.restore();
  });

  it('should prevent new hand if old one not complete.', function(done) {
    var blind = new EWT(ABI_BET).bet(1, 100).sign(P1_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, {Item:{handId: 0}}).onFirstCall().yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('still playing');
      done();
    }).catch(done);
  });

  it('should prevent small blind from player not in lineup.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var lineup = ['0x1256', '0x1234'];

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, lineup);
    sinon.stub(dynamo, 'getItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('Forbidden');
      done();
    }).catch(done);
  });

  it('should prevent game with less than 2 players.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 100).sign(P1_KEY);

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, [P1_ADDR]);
    sinon.stub(dynamo, 'getItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('no-one there to play');
      done();
    }).catch(done);
  });

  it('should prevent blind with wrong value.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 80).sign(P1_KEY);

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, [P1_ADDR, P2_ADDR]);
    sinon.stub(dynamo, 'getItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('small blind not valid');
      done();
    }).catch(done);
  });

  it('should check turn for blind.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 50).sign(P2_KEY);

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, [P1_ADDR, P2_ADDR]);
    sinon.stub(dynamo, 'getItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('not your turn');
      done();
    }).catch(done);
  });

  it('should allow to pay small blind for hand 0.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var lineup = [P1_ADDR, P2_ADDR];

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, lineup);
    sinon.stub(dynamo, 'getItem').yields(null, {});//.onFirstCall().yields(null, {Item:[]});
    sinon.stub(dynamo, 'putItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).then(function(rsp) {
      expect(dynamo.putItem).calledWith({Item: {
        deck: sinon.match.any,
        handState: 'dealing',
        handId: 0,
        dealer: 0,
        lineup: [{address: P1_ADDR, last: blind},{address: P2_ADDR}],
        tableAddr: tableAddr
      }, TableName: 'poker'});
      done();
    }).catch(done);
  });

  it('should allow to pay small blind for next hand.', function(done) {
    var blind = new EWT(ABI_BET).bet(2, 50).sign(P1_KEY);
    var lineup = [P1_ADDR, P2_ADDR];

    sinon.stub(contract, 'params').yields(null, [new BigNumber(1000), new BigNumber(10000), new BigNumber(100), new BigNumber(10)]);
    sinon.stub(contract, 'lineup').yields(null, lineup);
    sinon.stub(dynamo, 'getItem').yields(null, {Item:{
      lineup: [{address: P1_ADDR},{address: P2_ADDR}],
      distribution: 'dist',
      dealer: 1
    }}).onFirstCall().yields(null, {});
    sinon.stub(dynamo, 'putItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo), new Contract(provider));

    oracle.pay(tableAddr, blind).then(function(rsp) {
      expect(dynamo.putItem).calledWith({Item: {
        deck: sinon.match.any,
        handState: 'dealing',
        handId: 2,
        dealer: 0,
        lineup: [{address: P1_ADDR, last: blind},{address: P2_ADDR}],
        tableAddr: tableAddr
      }, TableName: 'poker'});
      done();
    }).catch(done);
  });

  it('should prevent big blind from not in lineup.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [{address: '0x1256'}, {address: '0x1234'}];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup
    }});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('Forbidden');
      done();
    }).catch(done);
  });

  it('should prevent big blind too small.', function(done) {
    var smallBlind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var bigBlind = new EWT(ABI_BET).bet(0, 80).sign(P2_KEY);
    var lineup = [{address: P1_ADDR, last: smallBlind}, {address: P2_ADDR}];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'dealing',
      dealer: 0
    }});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, bigBlind).catch(function(err) {
      expect(err).to.contain('not valid');
      done();
    }).catch(done);
  });

  it('should allow to pay big blind.', function(done) {
    var smallBlind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var bigBlind = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [{address: P1_ADDR, last: smallBlind}, {address: P2_ADDR}];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      deck: deck,
      handState: 'dealing',
      dealer: 0
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, bigBlind).then(function(rsp) {
      expect(rsp).to.eql({
        cards: [2, 3]
      });
      //expect(dynamo.updateItem).calledWith({});
      done();
    }).catch(done);
  });

  it('should prevent reusing receipts.', function(done) {
    var blind = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [{ address: P1_ADDR}, {address: P2_ADDR, last: blind}];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup
    }});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, blind).catch(function(err) {
      expect(err).to.contain('Unauthorized');
      done();
    }).catch(done);
  });

  it('should allow to deal.', function(done) {
    var smallBlind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var bigBlind = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var zeroBlind = new EWT(ABI_BET).bet(0, 0).sign(P3_KEY);
    var lineup = [
      {address: P1_ADDR, last: smallBlind},
      {address: P2_ADDR, last: bigBlind},
      {address: P3_ADDR}
    ];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'dealing',
      deck: deck,
      dealer: 0
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, zeroBlind).then(function(rsp) {
      expect(rsp).to.eql({
        cards: [4, 5]
      });
      //expect(dynamo.updateItem).calledWith({});
      done();
    }).catch(done);
  });

  it('should prevent playing lower bet.', function(done) {
    var smallBlind = new EWT(ABI_BET).bet(0, 50).sign(P1_KEY);
    var bigBlind = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lowBet = new EWT(ABI_BET).bet(0, 0).sign(P1_KEY);
    var lineup = [
      {address: P1_ADDR, last: smallBlind},
      {address: P2_ADDR, last: bigBlind}
    ];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'turn',
      deck: deck,
      dealer: 0
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    oracle.pay(tableAddr, lowBet).catch(function(err) {
      expect(err).to.contain('Unauthorized');
      expect(err).to.contain('match or raise');
      done();
    }).catch(done);
  });

});

describe('Oracle info', function() {

  beforeEach(function () {
    sinon.stub(provider, 'getTable').returns(contract);
  });

  afterEach(function () {
    if (contract.lineup.restore) contract.lineup.restore();
    if (contract.params.restore) contract.params.restore();
    if (provider.getTable.restore) provider.getTable.restore();
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.putItem.restore) dynamo.putItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
    if (dynamo.query.restore) dynamo.query.restore();
  });

  it('should allow to get uninitialized info.', function(done) {
    sinon.stub(dynamo, 'query').yields(null, { Items: []});

    new Oracle(new Db(dynamo)).info(tableAddr).catch(function(err) {
      expect(err).to.contain('Not Found:');
      done();
    }).catch(done);
  });

  it('should allow to get preflop info.', function(done) {
    sinon.stub(dynamo, 'query').yields(null, { Items: [ { 
      handId: 0,
      deck: deck,
      lineup: [],
      handState: 'preflop'
    }]});

    new Oracle(new Db(dynamo)).info(tableAddr).then(function(rsp) {
      expect(rsp).to.eql({
        handId: 0,
        cards: [],
        lineup: [],
        state: 'preflop'
      });
      done();
    }).catch(done);
  });

  it('should allow to get flop info.', function(done) {
    sinon.stub(dynamo, 'query').yields(null, { Items: [ { 
        handId: 0,
        deck: deck,
        lineup: [],
        handState: 'flop'
    }]});

    new Oracle(new Db(dynamo)).info(tableAddr).then(function(rsp) {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22],
        lineup: [],
        state: 'flop'
      });
      done();
    }).catch(done);
  });

  it('should allow to get turn info.', function(done) {
    sinon.stub(dynamo, 'query').yields(null, { Items: [ { 
        handId: 0,
        deck: deck,
        lineup: [],
        handState: 'turn'
    }]});

    new Oracle(new Db(dynamo)).info(tableAddr).then(function(rsp) {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23],
        lineup: [],
        state: 'turn'
      });
      done();
    }).catch(done);
  });

  it('should allow to get river info.', function(done) {
    sinon.stub(dynamo, 'query').yields(null, { Items: [ { 
        handId: 0,
        deck: deck,
        lineup: [],
        handState: 'river'
    }]});

    new Oracle(new Db(dynamo)).info(tableAddr).then(function(rsp) {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23, 24],
        lineup: [],
        state: 'river'
      });
      done();
    }).catch(done);
  });

  it('should allow to get showdown info.', function(done) {
    var show1 = new EWT(ABI_SHOW).show(0, 50).sign(P1_KEY);
    var muck2 = new EWT(ABI_MUCK).muck(0, 50).sign(P2_KEY);
    var lineup = [
      {address: P1_ADDR, last: show1},
      {address: P2_ADDR, last: muck2}
    ];

    sinon.stub(dynamo, 'query').yields(null, { Items: [ { 
        handId: 0,
        deck: deck,
        lineup: lineup,
        distribution: 'dist',
        handState: 'showdown'
    }]});

    new Oracle(new Db(dynamo)).info(tableAddr).then(function(rsp) {
      expect(rsp).to.eql({
        handId: 0,
        cards: [20, 21, 22, 23, 24],
        lineup: [{
          address: P1_ADDR,
          cards: [0, 1],
          last: show1
        }, {
          address: P2_ADDR,
          last: muck2
        }],
        distribution: 'dist',
        state: 'showdown'
      });
      done();
    }).catch(done);
  });

});


describe('Oracle show', function() {

  afterEach(function () {
    if (dynamo.getItem.restore) dynamo.getItem.restore();
    if (dynamo.updateItem.restore) dynamo.updateItem.restore();
  });

  it('should prevent show before showdown', function(done) {
    var show1 = new EWT(ABI_SHOW).show(0, 100).sign(P1_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      handState: 'river',
      deck: deck
    }});

    var oracle = new Oracle(new Db(dynamo));

    oracle.show(tableAddr, show1, [0, 1]).catch(function(err) {
      expect(err).to.contain('not in showdown');
      done();
    }).catch(done);
  });

  it('should prevent bet in showdown', function(done) {
    var bet1 = new EWT(ABI_BET).bet(0, 100).sign(P1_KEY);
    var bet2 = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [
      {address: P1_ADDR, last: bet1},
      {address: P2_ADDR, last: bet2},
    ];
    var bet = new EWT(ABI_BET).bet(0, 200).sign(P1_KEY);

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'showdown',
      deck: deck
    }});

    var oracle = new Oracle(new Db(dynamo));

    oracle.show(tableAddr, bet, [0, 1]).catch(function(err) {
      expect(err).to.contain('only "show" and "muck" receipts');
      done();
    }).catch(done);
  });

  it('should allow to showdown with 1 winner.', function(done) {
    var bet1 = new EWT(ABI_BET).bet(0, 100).sign(P1_KEY);
    var bet2 = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [
      {address: P1_ADDR, last: bet1},
      {address: P2_ADDR, last: bet2},
    ];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'showdown',
      deck: [12,11,2,3,4,5,6,7,8,9,10,1,0,13,14,15,22,17,18,19,20,21,36,23,24,25]
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    var show = new EWT(ABI_SHOW).show(0, 100).sign(P1_KEY);

    oracle.show(tableAddr, show, [12, 11]).then(function(rsp) {
      var dist = EWT.parse(rsp);
      expect(dist.signer).to.eql(P4_ADDR);
      expect(dist.values[3]).to.eql([2, 198]);
      expect(dist.values[2]).to.eql([P4_ADDR, P1_ADDR]);
      //expect(dynamo.updateItem).calledWith({});
      done();
    }).catch(done);
  });

  it('should allow to showdown with 2 winners.', function(done) {
    var bet1 = new EWT(ABI_BET).bet(0, 100).sign(P1_KEY);
    var bet2 = new EWT(ABI_BET).bet(0, 100).sign(P2_KEY);
    var lineup = [
      {address: P1_ADDR, last: bet1},
      {address: P2_ADDR, last: bet2},
    ];

    sinon.stub(dynamo, 'getItem').yields(null, {}).onFirstCall().yields(null, {Item:{
      lineup: lineup,
      handState: 'showdown',
      deck: deck
    }});
    sinon.stub(dynamo, 'updateItem').yields(null, {});

    var oracle = new Oracle(new Db(dynamo));

    var show = new EWT(ABI_SHOW).show(0, 100).sign(P1_KEY);

    oracle.show(tableAddr, show, [0, 1]).then(function(rsp) {
      var dist = EWT.parse(rsp);
      expect(dist.signer).to.eql(P4_ADDR);
      expect(dist.values[3]).to.eql([2, 99, 99]);
      expect(dist.values[2]).to.eql([P4_ADDR, P1_ADDR, P2_ADDR]);
      //expect(dynamo.updateItem).calledWith({});
      done();
    }).catch(done);
  });

});