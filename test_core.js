const assert = require('node:assert/strict');
const N = require('./core.js');
function near(a,b,tol) { assert.ok(Math.abs(a-b)<tol,`${a} not within ${tol} of ${b}`); }
assert.equal(N.maneuverKind('TURN_LEFT',''), 'left');
assert.equal(N.maneuverKind('TURN_SLIGHT_RIGHT',''), 'right');
assert.equal(N.maneuverKind('UTURN_LEFT',''), 'uturn');
assert.equal(N.maneuverKind('ROUNDABOUT_RIGHT',''), 'roundabout');
assert.equal(N.maneuverKind('','Rẽ phải vào phố A'), 'right');
assert.equal(N.maneuverKind('','unknown'), 'unknown');
assert.equal(N.distanceLabel(148), '150 m');
assert.equal(N.distanceLabel(28), '30 m');
assert.equal(N.distanceLabel(1370), '1,4 km');
const a = {lat: 16, lng:108}, b = {lat: 16, lng: 108.01};
near(N.meters(a,b), 1067, 5);
const route = {legs:[{steps:[
{maneuver:'DEPART',instructions:'Đi thẳng',distanceMeters:1067,path:[a,b],startLocation:a,endLocation:b},
{maneuver:'TURN_RIGHT',instructions:'Rẽ phải vào đường A',distanceMeters:1000,path:[b,{lat:16.01,lng:108.01}],startLocation:b,endLocation:{lat:16.01,lng:108.01}}
]}]};
const steps=N.routeSteps(route);
const match=N.matchRoute({lat:16,lng:108.005},steps);
assert.equal(match.stepIndex,0);
near(match.metersToTurn,533.5,5);
near(match.metersRemaining,1533.5,5);
assert.equal(N.maneuverKind(steps[match.nextIndex].maneuver,''),'right');
const match2=N.matchRoute({lat:16.005,lng:108.01},steps);
assert.equal(match2.stepIndex,1);
near(match2.metersToTurn,500,5);
assert.equal(N.shortInstruction('<b>Rẽ phải</b>  vào phố A'), 'Rẽ phải vào phố A');
console.log('OK: 14 navigation core checks');
