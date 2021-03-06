
/**
 * Copyright (c) 2017-present, Parsec Labs (parseclabs.org)
 *
 * This source code is licensed under the GNU Affero General Public License,
 * version 3, found in the LICENSE file in the root directory of this source 
 * tree.
 */

// transform from key/value to list and back
const transform = (data) => {
  let attributes;
  if (Array.isArray(data)) {
    attributes = {};
    data.forEach((aPair) => {
      if (!attributes[aPair.Name]) {
        attributes[aPair.Name] = {};
      }
      attributes[aPair.Name] = aPair.Value;
    });
  } else {
    attributes = [];
    Object.keys(data).forEach((anAttributeName) => {
      if (Array.isArray(data[anAttributeName])) {
        data[anAttributeName].forEach((aValue) => {
          attributes.push({
            Name: anAttributeName,
            Value: aValue,
          });
        });
      } else {
        attributes.push({
          Name: anAttributeName,
          Value: data[anAttributeName],
        });
      }
    });
  }
  return attributes;
};

export default class Db {

  constructor(sdb, tableName) {
    this.sdb = sdb;
    this.tableName = tableName;
  }

  reserveSeat(tableAddr, pos, signerAddr, txHash, amount) {
    return this.putAttributes({
      DomainName: this.tableName,
      ItemName: `${tableAddr}-${pos}`,
      Attributes: [
        { Name: 'tableAddr', Value: tableAddr },
        { Name: 'pos', Value: String(pos) },
        { Name: 'signerAddr', Value: signerAddr },
        { Name: 'txHash', Value: txHash },
        { Name: 'amount', Value: amount },
        { Name: 'created', Value: String(Math.round(Date.now() / 1000)) },
      ],
    });
  }

  async getSeat(tableAddr, pos) {
    const data = await this.getAttributes({
      DomainName: this.tableName,
      ItemName: `${tableAddr}-${pos}`,
    });

    if (!data.Attributes) {
      return null;
    }

    return transform(data.Attributes);
  }

  async getTableReservations(tableAddr) {
    const { Items: reservations = [] } = await this.select({
      SelectExpression: `select * from \`${this.tableName}\` where \`tableAddr\`="${tableAddr}"`,
    });

    return reservations.map(item => transform(item.Attributes)).reduce((memo, item) => ({
      ...memo,
      [item.pos]: {
        signerAddr: item.signerAddr,
        amount: item.amount,
        txHash: item.txHash,
      },
    }), {});
  }

  async getReservations() {
    const { Items = [] } = await this.select({
      SelectExpression: `select * from \`${this.tableName}\``,
    });

    return Items.map(item => transform(item.Attributes));
  }

  async deleteItems(items) {
    return items.map(item => this.deleteAttributes({
      DomainName: this.tableName,
      ItemName: `${item.tableAddr}-${item.pos}`,
      Attributes: transform(item),
    }));
  }

  method(name, params) {
    return new Promise((resolve, reject) => {
      this.sdb[name](params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  putAttributes(params) {
    return this.method('putAttributes', params);
  }

  select(params) {
    return this.method('select', params);
  }

  getAttributes(params) {
    return this.method('getAttributes', params);
  }

  deleteAttributes(params) {
    return this.method('deleteAttributes', params);
  }

  createDomain(params) {
    return this.method('createDomain', params);
  }

}
