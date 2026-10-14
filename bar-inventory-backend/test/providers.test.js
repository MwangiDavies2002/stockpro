const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.ETIMS_ENCRYPTION_KEY='ab'.repeat(32);
const {encrypt,decrypt}=require('../src/utils/secrets');
const {buildPayload}=require('../src/services/etims');
test('KRA payload reconciles inclusive totals, discounts and payment method',()=>{
  const settings={etims_initialized:1,etims_password_encrypted:encrypt('test-only-key'),kra_pin:'P000000000A',etims_branch_id:'00',name:'Audit'};
  const doc={id:1,created_by:1,type:'invoice',reference_no:'AUDIT',document_date:'2026-10-14',payment_method:'mpesa',subtotal:180,tax_total:28.8,total:208.8};
  const item={item_name:'Parts',quantity:2,unit_price:100,discount_percent:10,discount_amount:20,tax_percent:16,tax_amount:28.8,line_total:208.8,etims_item_code:'AUDIT',etims_class_code:'123',etims_tax_category:'B',etims_qty_unit:'U',etims_pkg_unit:'NT'};
  const payload=buildPayload(settings,doc,[item],1);
  assert.equal(payload.pmtTyCd,'06');assert.equal(payload.invcNo,1);assert.equal(payload.totAmt,208.8);
  assert.equal(payload.taxblAmtB,208.8);assert.equal(payload.taxAmtB,28.8);
  assert.equal(payload.itemList[0].splyAmt,232);assert.equal(payload.itemList[0].dcAmt,23.2);
  assert.equal(payload.itemList[0].totAmt,payload.totAmt);assert.equal(payload.receipt.prchrAcptcYn,'N');
  assert.throws(()=>buildPayload(settings,doc,[{...item,etims_item_code:null}],1),/Map KRA/);
  assert.throws(()=>buildPayload({...settings,etims_initialized:0},doc,[item],1),/Initialize/);
});
test('Integration secrets round-trip encrypted and detect tampering',()=>{
  const value=encrypt('test-only-secret');assert.ok(!value.includes('test-only-secret'));assert.equal(decrypt(value),'test-only-secret');
  const parts=value.split(':');parts[3]=Buffer.alloc(16).toString('base64');assert.throws(()=>decrypt(parts.join(':')));
});
test('M-Pesa rejects absent configuration without making a network call',()=>{
  delete process.env.MPESA_CONSUMER_KEY;
  assert.throws(()=>require('../src/services/mpesa').configuration(),error=>error.status===503);
});
