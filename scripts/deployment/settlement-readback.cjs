'use strict';
const CANARY=Object.freeze({account:'acct_1TYAidBM9Cu8R81S',paymentIntent:'pi_3UfYrxBM9Cu8R81S3qo4jnfc',charge:'ch_3UfYrxBM9Cu8R81S3P48Lh1u',balanceTransaction:'txn_3UfYrxBM9Cu8R81S3uypRMSL',amount:200,currency:'usd',expectedAvailableOn:'2026-12-02T00:00:00.000Z'});
async function verifySettlement(key,transport=fetch){
 if(!/^(sk|rk)_live_/.test(key||''))throw Error('LIVE_READ_CREDENTIAL_REQUIRED');
 const get=async path=>{const response=await transport('https://api.stripe.com/v1'+path,{method:'GET',headers:{Authorization:'Bearer '+key,'Stripe-Version':'2026-11-18.endive'},redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('STRIPE_READ_HTTP_'+response.status);return response.json();};
 const account=await get('/account');if(account.id!==CANARY.account)throw Error('ACCOUNT_MISMATCH');
 const charge=await get('/charges/'+CANARY.charge),balance=await get('/balance_transactions/'+CANARY.balanceTransaction);
 if(charge.id!==CANARY.charge||charge.payment_intent!==CANARY.paymentIntent||!charge.livemode||!charge.paid||!charge.captured||charge.amount!==CANARY.amount||charge.currency!==CANARY.currency||charge.balance_transaction!==CANARY.balanceTransaction||balance.id!==CANARY.balanceTransaction||balance.source!==CANARY.charge||balance.amount!==CANARY.amount||balance.currency!==CANARY.currency)throw Error('CANARY_BINDING_MISMATCH');
 let cursor,complete=true;const payouts=[];
 for(let page=0;page<20;page++){
  const listed=await get('/payouts?limit=100&created[gte]='+charge.created+(cursor?'&starting_after='+encodeURIComponent(cursor):''));
  for(const payout of listed.data){
   if(payout.currency!==CANARY.currency)continue;
   if(!payout.automatic){payouts.push({id:payout.id,status:payout.status,automatic:false,canaryAssociation:'not_established_for_manual_payout'});continue;}
   let innerCursor,associated=false,membershipComplete=false;
   for(let i=0;i<20;i++){const rows=await get('/balance_transactions?payout='+encodeURIComponent(payout.id)+'&limit=100'+(innerCursor?'&starting_after='+encodeURIComponent(innerCursor):''));associated=associated||rows.data.some(x=>x.id===CANARY.balanceTransaction);if(!rows.has_more){membershipComplete=true;break;}if(!rows.data.length)throw Error('INVALID_PAGINATION');innerCursor=rows.data.at(-1).id;}
   if(associated)payouts.push({id:payout.id,status:payout.status,automatic:true,canaryAssociation:'verified_balance_transaction_membership',arrivalDate:new Date(payout.arrival_date*1000).toISOString(),failureCode:payout.failure_code??null});
   if(!membershipComplete)complete=false;
  }
  if(!listed.has_more){cursor=null;break;}if(!listed.data.length)throw Error('INVALID_PAGINATION');cursor=listed.data.at(-1).id;if(page===19)complete=false;
 }
 return{checkedAt:new Date().toISOString(),account:account.id,canary:{...CANARY,refundedCents:charge.amount_refunded},funds:{status:balance.status,availableOn:new Date(balance.available_on*1000).toISOString(),amountCents:balance.amount,feeCents:balance.fee,netCents:balance.net},payouts,paginationComplete:complete,stripeReportsAssociatedPayoutPaid:payouts.some(x=>x.canaryAssociation==='verified_balance_transaction_membership'&&x.status==='paid'),bankReceiptIndependentlyVerified:false,readOnly:true};
}
module.exports={CANARY,verifySettlement};
