var expect = require('chai').expect;
var sinon = require('sinon');
require('chai').use(require('sinon-chai'));
const StreamWorker = require('./lib/index');
const TableContract = require('./lib/tableContract');

const EWT = require('ethereum-web-token');

// BET can replace lower bet
// BET can replace SIT_OUT during dealing state
const ABI_BET = [{name: 'bet', type: 'function', inputs: [{type: 'uint'}, {type: 'uint'}]}];

// FOLD can replace all but SIT_OUT, and SHOW, given same amount
const ABI_FOLD = [{name: 'fold', type: 'function', inputs: [{type: 'uint'}, {type: 'uint'}]}];

const P1_ADDR = '0xf3beac30c498d9e26865f34fcaa57dbb935b0d74';
const P1_KEY = '0x278a5de700e29faae8e40e366ec5012b5ec63d36ec77e8a2417154cc1d25383f';

//secretSeed: 'brother mad churn often amount wing pretty critic rhythm man insane ridge' }
const P2_ADDR = '0xe10f3d125e5f4c753a6456fc37123cf17c6900f2';
const P2_KEY = '0x7bc8feb5e1ce2927480de19d8bc1dc6874678c016ae53a2eec6a6e9df717bfac';


var contract = {
  leave: {
    sendTransaction: function(){}, 
  },
}

var provider = {
  getTable: function(){},
  getAddress: function(){},
}

describe('Stream worker', function() {

  beforeEach(function () {
    sinon.stub(provider, 'getTable').returns(contract);
  });

  it('should send tx on new leave receipt.', (done) => {

    const event = {
      eventName: "MODIFY",
      dynamodb: {
        Keys: {
          tableAddr: { S: "0xa2decf075b96c8e5858279b31f644501a140e8a7" }
        },
        NewImage: {
          lineup: { L: [
            { M: { address: { S: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' } } },
            { M: {
              address: {
                S: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2'
              },
              lastHand: {
                N: '0'
              },
              leaveReceipt: {
                S: '0x99'
              }
            }},
          ]}
        },
        OldImage: {
          lineup: { L: [
            { M: { address: { S: '0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f' } } },
            { M: { address: { S: '0xc3ccb3902a164b83663947aff0284c6624f3fbf2' } } }
          ]}
        }
      }
    };
    sinon.stub(contract.leave, 'sendTransaction').yields(null, '0x123456');
    sinon.stub(provider, 'getAddress').returns('0x7777');

    const worker = new StreamWorker(new TableContract(provider));

    worker.process(event).then(function(tx) {
      expect(tx).to.eql('0x123456');
      expect(contract.leave.sendTransaction).calledWith('0x99', {from: '0x7777', gas: sinon.match.any}, sinon.match.any);
      done();
    }).catch(done);

  });

  it('should notify when hand with leaving player turns complete.', (done) => {
    var bet1 = new EWT(ABI_BET).bet(1, 50).sign(P1_KEY);
    var bet2 = new EWT(ABI_BET).bet(1, 100).sign(P2_KEY);
    var fold = new EWT(ABI_FOLD).fold(1, 50).sign(P1_KEY);

    var lineup = [
      {address: P1_ADDR, last: bet1},
      {address: P2_ADDR, last: bet2}
    ];

    const event = {
      eventName: "MODIFY",
      dynamodb: {
        OldImage: {
          dealer: { N: '0' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: bet1 } } },
            { M: { address: { S: P2_ADDR }, last: { S: bet2 }, lastHand: { N: '1' }, leaveReceipt: { S: '0x99' } } }
          ]}
        },
        NewImage: {
          dealer: { N: '0' },
          lineup: { L: [
            { M: { address: { S: P1_ADDR }, last: { S: bet1 } } },
            { M: { address: { S: P2_ADDR }, last: { S: fold }, lastHand: { N: '1' }, leaveReceipt: { S: '0x99' } } }
          ]}
        }
      }
    };

    const worker = new StreamWorker();
    worker.process(event).then(function(rsp) {
      expect(rsp).to.eql('now');
      done();
    }).catch(done);
  });

  afterEach(function () {
    if (contract.leave.sendTransaction.restore) contract.leave.sendTransaction.restore();
    if (provider.getTable.restore) provider.getTable.restore();
  });

});


// {
//     "Records": [
//         {
//             "eventID": "db2920985bc6ba7f5deef8d028876d5e",
//             "eventName": "MODIFY",
//             "eventVersion": "1.1",
//             "eventSource": "aws:dynamodb",
//             "awsRegion": "eu-west-1",
//             "dynamodb": {
//                 "ApproximateCreationDateTime": 1488198300,
//                 "Keys": {
//                     "handId": {
//                         "N": "4"
//                     },
//                     "tableAddr": {
//                         "S": "0xa2decf075b96c8e5858279b31f644501a140e8a7"
//                     }
//                 },
//                 "NewImage": {
//                     "deck": {},
//                     "dealer": "0",
//                     "handId": "4",
//                     "lineup": {
//                         "L": [
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f"
//                                     },
//                                     "last": {
//                                         "S": "eyJ0eXBlIjoiRVdUIiwiYWxnIjoiRVMyNTZrIn0.eyJiZXQiOlt7InVpbnQiOjR9LHsidWludCI6NTAwMDB9XSwidiI6MX0.aTQuKTw5m94EoDd6Ucn2qA7eRKdL1AtrjKErgZHOQXJtX6J7tRjWzhB14-sLcS0TpaK9ENT0LmN1c4Z9IlLWyg"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xc3ccb3902a164b83663947aff0284c6624f3fbf2"
//                                     },
//                                     "last": {
//                                         "S": "eyJ0eXBlIjoiRVdUIiwiYWxnIjoiRVMyNTZrIn0.eyJiZXQiOlt7InVpbnQiOjR9LHsidWludCI6NTAwMDB9XSwidiI6MX0.aTQuKTw5m94EoDd6Ucn2qA7eRKdL1AtrjKErgZHOQXJtX6J7tRjWzhB14-sLcS0TpaK9ENT0LmN1c4Z9IlLWyg"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xe10f3d125e5f4c753a6456fc37123cf17c6900f2"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xf3beac30c498d9e26865f34fcaa57dbb935b0d74"
//                                     }
//                                 }
//                             }
//                         ]
//                     },
//                     "handState": {
//                         "S": "dealing"
//                     },
//                     "tableAddr": {
//                         "S": "0xa2decf075b96c8e5858279b31f644501a140e8a7"
//                     }
//                 },
//                 "OldImage": {
//                     "deck": {
//                     },
//                     "dealer": {
//                         "N": "0"
//                     },
//                     "handId": {
//                         "N": "4"
//                     },
//                     "lineup": {
//                         "L": [
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0x82e8c6cf42c8d1ff9594b17a3f50e94a12cc860f"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xc3ccb3902a164b83663947aff0284c6624f3fbf2"
//                                     },
//                                     "last": {
//                                         "S": "eyJ0eXBlIjoiRVdUIiwiYWxnIjoiRVMyNTZrIn0.eyJiZXQiOlt7InVpbnQiOjR9LHsidWludCI6NTAwMDB9XSwidiI6MX0.aTQuKTw5m94EoDd6Ucn2qA7eRKdL1AtrjKErgZHOQXJtX6J7tRjWzhB14-sLcS0TpaK9ENT0LmN1c4Z9IlLWyg"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xe10f3d125e5f4c753a6456fc37123cf17c6900f2"
//                                     }
//                                 }
//                             },
//                             {
//                                 "M": {
//                                     "address": {
//                                         "S": "0xf3beac30c498d9e26865f34fcaa57dbb935b0d74"
//                                     }
//                                 }
//                             }
//                         ]
//                     },
//                     "handState": {
//                         "S": "dealing"
//                     },
//                     "tableAddr": {
//                         "S": "0xa2decf075b96c8e5858279b31f644501a140e8a7"
//                     }
//                 },
//                 "SequenceNumber": "742292900000000001062735493",
//                 "SizeBytes": 1558,
//                 "StreamViewType": "NEW_AND_OLD_IMAGES"
//             },
//             "eventSourceARN": "arn:aws:dynamodb:eu-west-1:105751009136:table/poker/stream/2017-02-27T12:13:35.529"
//         }
//     ]
// }