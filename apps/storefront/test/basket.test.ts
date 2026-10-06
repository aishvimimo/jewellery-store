import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBasket, emptyBasket, addLine, setQuantity, toggleWish } from '../src/lib/basket.js';
test('cart and wishlist survive serialization without persisting prices',()=>{
  let state=addLine(emptyBasket(),{variantId:'v1',slug:'gold-ring',quantity:1});state=toggleWish(state,'gold-ring');
  assert.deepEqual(decodeBasket(JSON.stringify(state)),state);assert.equal(JSON.stringify(state).includes('price'),false);
});
test('repeated additions merge variants and quantities are bounded',()=>{
  let state=addLine(emptyBasket(),{variantId:'v1',slug:'gold-ring',quantity:15});state=addLine(state,{variantId:'v1',slug:'gold-ring',quantity:10});assert.equal(state.cart.length,1);assert.equal(state.cart[0].quantity,20);
  state=setQuantity(state,'v1',-1);assert.equal(state.cart.length,0);
});
test('corrupted or invalid persisted data is safely discarded',()=>{
  assert.deepEqual(decodeBasket('broken'),emptyBasket());assert.deepEqual(decodeBasket('{"cart":[{"variantId":"v","slug":"s","quantity":-3}],"wishlist":[]}'),emptyBasket());
  assert.deepEqual(decodeBasket(JSON.stringify({cart:[],wishlist:['x','x']})).wishlist,['x']);
});
test('wishlist toggles and saving an item for later preserves the selection',()=>{
  let state=addLine(emptyBasket(),{variantId:'v',slug:'ring',quantity:1});state=toggleWish(state,'ring');state=setQuantity(state,'v',0);assert.deepEqual(state.wishlist,['ring']);assert.equal(state.cart.length,0);state=toggleWish(state,'ring');assert.equal(state.wishlist.length,0);
});
