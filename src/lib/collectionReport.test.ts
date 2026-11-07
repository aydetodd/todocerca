import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatCents, reconcileCollections, type CollectionReport } from './collectionReport';
const report: CollectionReport = {
  total_cents:'365485487',operations_cents:'365485487',balance_cents:'0',count:5,operations_count:5,
  branches:[
    {id:'x',name:'X',cents:'147836222',count:3,terminals:[{id:'a',name:'A',cents:'34264365',count:1},{id:'b',name:'B',cents:'2345753',count:1},{id:'c',name:'C',cents:'111226104',count:1}]},
    {id:'y',name:'Y',cents:'46735688',count:1,terminals:[{id:'a',name:'A',cents:'46735688',count:1}]},
    {id:'unassigned',name:'Sin sucursal',cents:'170913577',count:1,terminals:[{id:'unassigned',name:'Sin terminal',cents:'170913577',count:1}]},
  ],
};
test('empresa 3,654,854.87 concilia exactamente con sucursales y terminales',()=>assert.equal(reconcileCollections(report),true));
test('un centavo de diferencia en terminal impide marcar conciliado',()=>assert.equal(reconcileCollections({...report,branches:report.branches.map((b,i)=>i===0?{...b,terminals:b.terminals.map((t,j)=>j===0?{...t,cents:'34264366'}:t)}:b)}),false));
test('recibo faltante no concilia aunque coincida el importe',()=>assert.equal(reconcileCollections({...report,operations_count:4}),false));
test('operaciones con un centavo de diferencia no concilian',()=>assert.equal(reconcileCollections({...report,operations_cents:'365485486'}),false));
test('saldo disponible no se usa como total cobrado',()=>assert.equal(reconcileCollections({...report,balance_cents:'123'}),true));
test('sin sucursal participa en la suma, no se descarta',()=>assert.equal(reconcileCollections({...report,branches:report.branches.slice(0,2)}),false));
test('formato no pierde centavos con importes grandes',()=>assert.equal(formatCents('900719925474099301'),'$9,007,199,254,740,993.01'));