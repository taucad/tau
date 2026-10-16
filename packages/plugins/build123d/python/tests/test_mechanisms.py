"""Native matrix oracles for the shipped Build123D mechanism adapter."""
from __future__ import annotations
import copy
import json
import math
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build123d import Axis, BallJoint, Box, Compound, CylindricalJoint, LinearJoint, Location, Plane, RevoluteJoint, RigidJoint, Rotation
from mechanisms import _matrix, _wire, project_mechanism


def components(shapes):
    result = []
    def visit(shape, parent=None):
        entry = {"id": str(len(result)), "name": shape.label, "kind": "assembly" if shape.children else "part", "selector": str(len(result))}
        if parent is not None: entry['parentId'] = parent
        result.append(entry)
        if shape.children: entry['childIds'] = [visit(child,entry['id']) for child in shape.children]
        return entry['id']
    for shape in shapes: visit(shape)
    return result


def evaluate(mechanism, coordinates):
    poses = {mechanism['root']: np.eye(4)}
    joints = dict(mechanism['joints'])
    while joints:
        progressed = False
        for key,joint in list(joints.items()):
            if joint['parent'] not in poses: continue
            axis = np.asarray(joint.get('axis',[0.,0.,1.]))
            value = coordinates.get(key,0.)
            motion = np.eye(4)
            if joint['type'] == 'revolute':
                angle = math.radians(value)
                x,y,z = axis/np.linalg.norm(axis)
                skew=np.array([[0.,-z,y],[z,0.,-x],[-y,x,0.]])
                rotation=np.eye(3)+math.sin(angle)*skew+(1-math.cos(angle))*(skew@skew)
                origin=np.asarray(joint['origin'])
                motion[:3,:3]=rotation
                motion[:3,3]=origin-rotation@origin
            elif joint['type'] == 'prismatic': motion[:3,3]=axis*value
            poses[joint['child']]=poses[joint['parent']]@motion
            del joints[key]
            progressed=True
        if not progressed: raise AssertionError('Non-tree playback')
    return poses


def oracle_cases():
    cases=[]
    for kind in ('fixed','revolute','revolute-multiturn','linear','cylindrical','ball','ball-near-singular','linear-revolute'):
        for reverse in (False,True):
            if kind=='linear-revolute' and reverse: continue
            base=Box(3,4,5)
            child=Box(2,3,4)
            base.location=Location((17,-8,9),(23,41,-11))
            if kind=='fixed': native=RigidJoint('native',base,Location((2,3,4),(5,6,7))); state={}; next_state={}
            elif kind.startswith('revolute'):
                native=RevoluteJoint('native',base,axis=Axis((2,3,4),(0,0,1)),angle_reference=(1,1,0),angular_range=(-10000,10000));state={'angle':22.5};next_state={'angle':1462.5 if kind=='revolute-multiturn' else 95.5}
            elif kind in ('linear','linear-revolute'):
                native=LinearJoint('native',base,axis=Axis((2,3,4),(0,0,1)),linear_range=(-10,math.inf));state={'position':4};next_state={'position':11}
            elif kind=='cylindrical':
                native=CylindricalJoint('native',base,axis=Axis((2,3,4),(0,0,1)),angle_reference=(1,1,0),angular_range=(-720,720),linear_range=(-10,100));state={'position':4,'angle':22.5};next_state={'position':11,'angle':95.5}
            else:
                native=BallJoint('native',base,Location((2,3,4),(13,-7,9)),angular_range=((-180,180),(-90,90),(-180,180)),angle_reference=Plane.XY.rotated((10,20,15)));state={'angles':(30,40,20)};next_state={'angles':(80,-20,60)}
            if kind=='ball-near-singular': next_state={'angles':tuple((Rotation(45,89.999,32)*native.angle_reference.location.inverse()).orientation)}
            mate=RevoluteJoint('mate',child,axis=Axis.Z,angular_range=(-720,720)) if kind=='linear-revolute' else RigidJoint('mate',child,Location((-2,4,6),(12,23,34)))
            if kind=='linear-revolute': state['angle']=22.5;next_state['angle']=95.5
            source,target=(mate,native) if reverse else (native,mate)
            source.connect_to(target,**state)
            assembly=Compound(children=[base,child])
            assembly.location=Location((40,20,-10),(11,12,13))
            result=project_mechanism((assembly,),components((assembly,)))
            if 'mechanism' not in result: raise AssertionError(result)
            record=result['mechanismIntent']['connections'][0]
            coords={}
            if kind.startswith('ball'):
                composed=Rotation(*next_state['angles'])*native.angle_reference.location
                for axis,value in zip('xyz',tuple(composed.orientation),strict=True): coords[record['playbackCoordinates'][axis]]=value-record['referenceCoordinates'][axis]
            else:
                for key,value in next_state.items():
                    field='distance' if key=='position' else 'angle'
                    coords[record['playbackCoordinates'][field]]=value*(.001 if key=='position' else 1)-record['referenceCoordinates'][field]
            owner=_matrix(source.parent.global_location)
            before=_matrix(copy.copy(source).relative_to(copy.copy(target),**state))
            after=_matrix(copy.copy(source).relative_to(copy.copy(target),**next_state))
            expected=np.array(_wire(owner@after@np.linalg.inv(before)@np.linalg.inv(owner))).reshape(4,4).T
            actual=evaluate(result['mechanism'],coords)[record['child']['componentId']]
            cases.append({'name':kind+('-reverse' if reverse else ''),'mechanism':result['mechanism'],'coordinates':coords,'child':record['child']['componentId'],'expected':expected.T.reshape(-1).tolist(),'error':float(np.max(np.abs(actual-expected)))})
    return cases


class MechanismsTest(unittest.TestCase):
    def test_native_pairings_match_matrix_oracles(self):
        for case in oracle_cases():
            with self.subTest(case=case['name']): self.assertLess(case['error'],1e-9)

    def test_nonzero_native_angle_reference_is_preserved(self):
        a=Box(1,1,1);b=Box(1,1,1)
        shaft=RevoluteJoint('shaft',a,angle_reference=(1,1,0),angular_range=(-720,720))
        shaft.connect_to(RigidJoint('mount',b),angle=22.5)
        self.assertAlmostEqual(b.orientation.Z,67.5)
        result=project_mechanism((a,b),components((a,b)))
        self.assertEqual(result['mechanismIntent']['connections'][0]['referenceCoordinates'],{'angle':22.5})
        np.testing.assert_allclose(next(iter(evaluate(result['mechanism'],{}).values())),np.eye(4),atol=1e-12)

    def test_unconnected_interfaces_and_named_ids_survive_reordering(self):
        for reverse in (False, True):
            a=Box(1,2,3); b=Box(1,2,3)
            RigidJoint('mount',a,Location((1,2,3)))
            RigidJoint('mount',b,Location((3,2,1)))
            a.label=b.label='Renamed'
            model=Compound(children=[b,a] if reverse else [a,b])
            entries=components((model,))
            self.assertEqual(project_mechanism((model,),entries,{'occurrence_ids':{'a':a,'b':b}}),{})
            keyed={entry['id']:entry for entry in entries}
            self.assertEqual(keyed['occurrence:a']['jointInterfaces']['mount']['frame'][12:15],[.001,.003,-.002])

    def test_closed_loop_retains_intent_with_diagnostic(self):
        a=Box(1,1,1);b=Box(1,1,1)
        RigidJoint('a',a);RigidJoint('b',b)
        a.joints['a'].connect_to(b.joints['b'])
        RigidJoint('a2',a);RigidJoint('b2',b)
        b.joints['b2'].connect_to(a.joints['a2'])
        model=Compound(children=[a,b])
        result=project_mechanism((model,),components((model,)))
        self.assertEqual(len(result['mechanismIntent']['connections']),2)
        self.assertNotIn('mechanism',result)
        self.assertEqual(result['mechanismDiagnostics'][0]['code'],'UNSUPPORTED_MECHANISM')

class AdmissionTests(unittest.TestCase):
    def test_rejects_invalid_authoring_and_outside_endpoints(self):
        from mechanisms import _interface, _range, _reference, _motion_joints
        a=Box(1,1,1); b=Box(1,1,1)
        joint=RevoluteJoint('hinge',a,angular_range=(-360,360)); mount=RigidJoint('mount',b)
        for supplement,message in (([], 'dictionary'),({'unknown':0},'Unknown motion'),({'occurrence_ids':{'bad':b}},'occurrence_ids'),({'animations':[{}]},'connected native joints')):
            with self.subTest(message=message), self.assertRaisesRegex(ValueError,message): project_mechanism((a,),components((a,)),supplement)
        with self.assertRaisesRegex(ValueError,'traversals'): project_mechanism((a,),[])
        with self.assertRaisesRegex(ValueError,'occurs twice'): project_mechanism((a,a),components((a,a)))
        for bounds in ((2,1),(math.inf,math.inf),(-math.inf,-math.inf)):
            with self.subTest(bounds=bounds), self.assertRaisesRegex(ValueError,'lower <= upper'): _range(bounds)
        for bounds in ((math.inf,math.inf),(-math.inf,-math.inf)):
            part=Box(1,1,1)
            RevoluteJoint('unconnected',part,angular_range=bounds)
            with self.subTest(unconnected=bounds), self.assertRaisesRegex(ValueError,'finite admissible coordinate'):
                project_mechanism((part,),components((part,)))
        self.assertEqual(_range((-math.inf,math.inf)),{})
        with self.assertRaisesRegex(ValueError,'Unsupported native'): _interface(object())
        with self.assertRaisesRegex(ValueError,'retained coordinate'): _reference(joint,mount)
        linear=LinearJoint('linear',a)
        with self.assertRaisesRegex(ValueError,'retained coordinate'): _reference(linear,mount)
        joint._angle=math.nan
        with self.assertRaisesRegex(ValueError,'must be finite'): _motion_joints(joint,mount,'a','b','j')
        joint.connect_to(mount,angle=0)
        with self.assertRaisesRegex(ValueError,'outside'): project_mechanism((a,),components((a,)))
        a.joints['wrong']=mount
        with self.assertRaisesRegex(ValueError,'different occurrence'): project_mechanism((a,b),components((a,b)))

    def test_ground_can_reverse_native_connection_direction(self):
        for rotating in (False,True):
            a=Box(1,1,1);b=Box(1,1,1)
            source=RevoluteJoint('joint',a,angular_range=(-360,360)) if rotating else RigidJoint('joint',a)
            target=RigidJoint('mount',b)
            state={'angle':22.5} if rotating else {}
            source.connect_to(target,**state)
            model=Compound(children=[a,b]);shapes=(model,);entries=components(shapes)
            meshes={entry['id']:{'positions':[]} for entry in entries if entry['kind']=='part'}
            result=project_mechanism(shapes,entries,{'ground':b,'occurrence_ids':{'a':a,'b':b}},meshes=meshes)
            self.assertEqual(set(meshes),{'occurrence:a','occurrence:b'})
            self.assertEqual(result['mechanism']['root'],'occurrence:b')
            coords={next(iter(result['mechanism']['joints'])):73} if rotating else {}
            actual=evaluate(result['mechanism'],coords)['occurrence:a']
            before=_matrix(copy.copy(source).relative_to(copy.copy(target),**state))
            after=_matrix(copy.copy(source).relative_to(copy.copy(target),**({'angle':95.5} if rotating else {})))
            delta=_matrix(a.global_location)@after@np.linalg.inv(before)@np.linalg.inv(_matrix(a.global_location))
            np.testing.assert_allclose(actual,np.array(_wire(np.linalg.inv(delta))).reshape(4,4).T,atol=1e-10)

    def test_moving_after_connection_keeps_intent_and_explains_inconsistent_frames(self):
        for ball in (False,True):
            a=Box(1,1,1);b=Box(1,1,1)
            joint=BallJoint('joint',a,angular_range=((-180,180),(-90,90),(-180,180))) if ball else RevoluteJoint('joint',a)
            mount=RigidJoint('mount',b)
            joint.connect_to(mount,**({'angles':(0,0,0)} if ball else {'angle':0}))
            b.move(Location((5,0,0)))
            result=project_mechanism((a,b),components((a,b)))
            self.assertNotIn('mechanism',result)
            self.assertEqual(result['mechanismDiagnostics'][0]['code'],'UNSUPPORTED_MECHANISM')
            self.assertEqual(len(result['mechanismIntent']['connections']),1)

    def test_unreachable_cycle_does_not_drop_intent(self):
        parts=[Box(1,1,1) for _ in range(4)]
        for index,part in enumerate(parts):
            RigidJoint('out',part);RigidJoint('in',part)
        parts[0].joints['out'].connect_to(parts[1].joints['in'])
        parts[2].joints['out'].connect_to(parts[3].joints['in'])
        parts[3].joints['out'].connect_to(parts[2].joints['in'])
        result=project_mechanism(tuple(parts),components(tuple(parts)))
        self.assertNotIn('mechanism',result)
        self.assertEqual(len(result['mechanismIntent']['connections']),3)
        self.assertIn('closed or disconnected',result['mechanismDiagnostics'][0]['message'])

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--write-fixture':
        Path(sys.argv[2]).write_text(json.dumps([{key:value for key,value in case.items() if key!='error'} for case in oracle_cases()],indent=2)+'\n')
    else: unittest.main()
