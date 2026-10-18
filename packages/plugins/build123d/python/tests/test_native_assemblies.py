"""Native reusable assemblies, reference coordinates and independent placement oracles."""
from __future__ import annotations
import copy
import math
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build123d import Axis, BallJoint, Box, Compound, CylindricalJoint, LinearJoint, Location, RevoluteJoint, RigidJoint, export_step, import_step
from mechanisms import _matrix, _wire, project_mechanism
from test_mechanisms import components, evaluate


class Gearbox(Compound):
    """An ordinary model-domain class; Build123D alone constructs and exports it."""
    def __init__(self, angle=30.):
        plate, cover = Box(4,5,6), Box(4,5,1).located(Location((0,0,4)))
        housing = Compound(children=[plate,cover],label='Housing')
        rotor, follower = Box(1,2,3), Box(2,3,4)
        RigidJoint('mount',housing,Location((1,2,3),(11,12,13)))
        RevoluteJoint('drive',housing,Axis((3,1,2),(0,0,1)),angular_range=(-4000,4000))
        RevoluteJoint('follow',housing,Axis((-3,1,2),(0,0,1)),angular_range=(-8000,8000))
        RigidJoint('mount',rotor,Location((0,1,0)))
        RigidJoint('mount',follower,Location((1,0,0)))
        RigidJoint('output',rotor,Location((0,2,1),(7,8,9)))
        housing.joints['drive'].connect_to(rotor.joints['mount'],angle=angle)
        housing.joints['follow'].connect_to(follower.joints['mount'],angle=-2*angle+15)
        super().__init__(children=[housing,rotor,follower],label='Gearbox')
        self.input_angle=angle

    @property
    def housing(self): return self.children[0]
    @property
    def rotor(self): return self.children[1]
    @property
    def follower(self): return self.children[2]
    @property
    def mount(self): return self.housing.joints['mount']
    @property
    def output(self): return self.rotor.joints['output']
    def couplings(self):
        return [{'driver':(self.housing.joints['drive'],'angle'),'follower':(self.housing.joints['follow'],'angle'),'ratio':-2,'offset':15}]
    def connections(self):
        return [(self.housing.joints['drive'],self.rotor.joints['mount']),
                (self.housing.joints['follow'],self.follower.joints['mount'])]


def project(model, supplement=None):
    entries=components((model,))
    return project_mechanism((model,),entries,supplement),entries


def mount_module(module, source, target, **coordinates):
    """Explicit native recipe, not an API installed or used by the adapter."""
    target_in_module=module.global_location.inverse()*target.parent.global_location
    desired=source.parent.global_location*source.relative_to(target,**coordinates)*target_in_module.inverse()
    parent=module.parent.global_location if module.parent is not None else Location()
    module.locate(parent.inverse()*desired)
    # Refresh parent aggregate BReps after editing native child placements.
    ancestor=module.parent
    while ancestor is not None:
        location=ancestor.location
        ancestor.children=ancestor.children
        ancestor.locate(location)
        ancestor=ancestor.parent


class NativeAssemblyTest(unittest.TestCase):
    def test_native_factory_local_couplings_and_multiturn_clips(self):
        model=Gearbox(390)
        driver=(model.housing.joints['drive'],'angle')
        result,_=project(model,{'ground':model.housing,'couplings':model.couplings(),'animations':[{'id':'turn','duration':2,'keyframes':[
            {'time':0,'coordinates':{driver:390}},{'time':2,'coordinates':{driver:750}}]}]})
        mechanism=result['mechanism']; coupling=mechanism['couplings'][0]
        self.assertEqual(coupling['ratio'],-2)
        self.assertEqual(mechanism['animations'][0]['keyframes'][0]['coordinates'],{coupling['driver']:0})
        self.assertEqual(mechanism['animations'][0]['keyframes'][1]['coordinates'],{coupling['driver']:360})
        self.assertEqual(result['mechanismIntent']['connections'][0]['referenceCoordinates'],{'angle':390})
        self.assertEqual(len(model.solids()),4)
        self.assertIs(model.mount.parent,model.housing)
        self.assertIs(model.output.parent,model.rotor)
        self.assertEqual(model.joints,{})
        self.assertEqual(len(result['mechanismIntent']['rigidBodies']['occurrence:path/0/0']),2)

    def test_fresh_instances_mount_under_rotated_parent_without_moving_children_twice(self):
        base, carrier = Box(10,10,10), Box(8,8,2)
        base.locate(Location((17,18,19),(7,8,9)))
        RevoluteJoint('carrier',base,Axis((20,0,0),(0,0,1)),angular_range=(-360,360))
        RigidJoint('mount',carrier)
        RigidJoint('left',carrier,Location((10,0,0),(20,30,40)))
        RigidJoint('right',carrier,Location((-10,0,0),(-20,10,30)))
        left,right=Gearbox(30),Gearbox(30)
        moving=Compound(children=[carrier,left,right])
        moving.locate(Location((7,8,9),(10,11,12)))
        root=Compound(children=[base,moving]); root.locate(Location((40,50,60),(21,22,23)))
        before=[_matrix(c.location) for c in left.children]
        mount_module(left,carrier.joints['left'],left.mount)
        mount_module(right,carrier.joints['right'],right.mount)
        mount_module(moving,base.joints['carrier'],carrier.joints['mount'],angle=30)
        for part,expected in zip(left.children,before,strict=True):np.testing.assert_allclose(_matrix(part.location),expected,atol=1e-10)
        connections=[*left.connections(),*right.connections(),(carrier.joints['left'],left.mount),(carrier.joints['right'],right.mount),
                     {'source':base.joints['carrier'],'target':carrier.joints['mount'],'angle':30}]
        result,entries=project(root,{'ground':base,'connections':connections,'couplings':[*left.couplings(),*right.couplings()]})
        self.assertNotIn('mechanismDiagnostics',result)
        self.assertIsNot(left.mount,right.mount)
        for module,name in ((left,'left'),(right,'right')):
            expected=carrier.global_location*carrier.joints[name].relative_location
            actual=module.mount.parent.global_location*module.mount.relative_location
            np.testing.assert_allclose(_matrix(actual),_matrix(expected),atol=1e-10)
        records=result['mechanismIntent']['connections']; drive=records[0]['playbackCoordinates']['angle']
        coords={drive:25,records[1]['playbackCoordinates']['angle']:-50,records[-1]['playbackCoordinates']['angle']:30}
        poses=evaluate(result['mechanism'],coords)
        self.assertGreater(np.max(abs(poses[records[0]['child']['componentId']]-poses[records[2]['child']['componentId']])),.1)
        # Independent world-matrix derivative from native placement at 30 and 60.
        source,target=base.joints['carrier'],carrier.joints['mount']
        world=_matrix(base.global_location)
        before=_matrix(copy.copy(source).relative_to(copy.copy(target),angle=30))
        after=_matrix(copy.copy(source).relative_to(copy.copy(target),angle=60))
        expected=np.array(_wire(world@after@np.linalg.inv(before)@np.linalg.inv(world))).reshape(4,4).T
        np.testing.assert_allclose(poses[records[-1]['child']['componentId']],expected,atol=1e-10)
        # Native STEP aggregate agrees with each leaf's world position, not only joint matrices.
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'native.step';self.assertTrue(export_step(root,path)); imported=import_step(path)
        native_centers=sorted(tuple(round(v,6) for v in s.center()) for s in root.solids())
        imported_centers=sorted(tuple(round(v,6) for v in s.center()) for s in imported.solids())
        self.assertEqual(native_centers,imported_centers)
        self.assertEqual(len(imported.solids()),10)
        for module in (left,right):
            for shape in module.children:
                if shape.children: continue
                world_center=(shape.global_location*shape.location.inverse()*Location(shape.center())).position
                self.assertIn(tuple(round(v,6) for v in world_center),native_centers)

    def test_explicit_edges_preserve_overwritten_multiturn_coordinates_and_pair_orientation(self):
        base,a,b=Box(1,1,1),Box(1,1,1),Box(1,1,1)
        joint=RevoluteJoint('drive',base,angular_range=(-2000,2000));ja=RigidJoint('mount',a);jb=RigidJoint('mount',b)
        joint.connect_to(ja,angle=390);joint.connect_to(jb,angle=780)
        root=Compound(children=[base,a,b]);native_angle=joint._angle
        declarations={'ground':base,'connections':[{'source':joint,'target':ja,'angle':390},{'source':joint,'target':jb,'angle':780}],
                      'couplings':[{'driver':((joint,ja),'angle'),'follower':((jb,joint),'angle'),'ratio':2}],
                      'animations':[{'id':'turn','duration':1,'keyframes':[{'time':0,'coordinates':{((ja,joint),'angle'):390}}, {'time':1,'coordinates':{((joint,ja),'angle'):750}}]}]}
        result,_=project(root,declarations)
        self.assertEqual([c['referenceCoordinates']['angle'] for c in result['mechanismIntent']['connections']],[390,780])
        self.assertEqual(joint._angle,native_angle)
        self.assertEqual(result['mechanism']['couplings'][0]['ratio'],2)
        declarations['couplings'][0]['driver']=(joint,'angle')
        with self.assertRaisesRegex(ValueError,'exactly one'):project(root,declarations)
        declarations['couplings']=[];declarations['animations']=[];declarations['connections'][0]['angle']=400
        with self.assertRaisesRegex(ValueError,'final occurrence placement'):project(root,declarations)

    def test_mixed_units_and_nonzero_phase(self):
        base,slider,rotor=Box(1,1,1),Box(1,1,1),Box(1,1,1)
        slide=LinearJoint('slide',base,linear_range=(-100,100));spin=RevoluteJoint('spin',base,angular_range=(-1000,1000))
        slide.connect_to(RigidJoint('mount',slider),position=10);spin.connect_to(RigidJoint('mount',rotor),angle=25)
        root=Compound(children=[base,slider,rotor])
        supplement={'couplings':[{'driver':(slide,'distance'),'follower':(spin,'angle'),'ratio':2,'offset':5}],
                    'animations':[{'id':'slide','duration':1,'keyframes':[{'time':0,'coordinates':{(slide,'distance'):10}},{'time':1,'coordinates':{(slide,'distance'):20}}]}]}
        result,_=project(root,supplement);coupling=result['mechanism']['couplings'][0]
        self.assertEqual(coupling['ratio'],2000)
        self.assertEqual(result['mechanism']['animations'][0]['keyframes'][1]['coordinates'],{coupling['driver']:.01})
        supplement['couplings'][0]['offset']=0
        with self.assertRaisesRegex(ValueError,'phase'):project(root,supplement)

    def test_explicit_ball_coordinates_are_checked_and_native_rotation_is_supported(self):
        a,b=Box(1,1,1),Box(1,1,1)
        joint=BallJoint('ball',a,angular_range=((-180,180),(-90,90),(-180,180)))
        target=RigidJoint('mount',b)
        joint.connect_to(target,angles=(10,20,30))
        root=Compound(children=[a,b])
        from build123d import Rotation
        for angles in ((10,20,30),Rotation(10,20,30)):
            result,_=project(root,{'connections':[{'source':joint,'target':target,'angles':angles}]})
            np.testing.assert_allclose(list(result['mechanismIntent']['connections'][0]['referenceCoordinates'].values()),[10,20,30],atol=1e-10)
        with self.assertRaisesRegex(ValueError,'final occurrence placement'):
            project(root,{'connections':[{'source':joint,'target':target,'angles':(40,50,60)}]})
        for state in ({'angle':0},{'angles':(0,100,0)},{'angles':(0,math.nan,0)},{'position':True}):
            with self.subTest(state=state),self.assertRaises(ValueError):
                project(root,{'connections':[{'source':joint,'target':target,**state}]})

    def test_reversed_native_pair_and_unassigned_passive_geometry_do_not_invent_mounts(self):
        for reverse in (False,True):
            housing=Compound(children=[Box(2,3,4),Box(1,1,1)])
            rotor=Box(1,2,3)
            joint=RevoluteJoint('shaft',housing,angular_range=(-720,720));target=RigidJoint('mount',rotor)
            if reverse:target.connect_to(joint,angle=30)
            else:joint.connect_to(target,angle=30)
            root=Compound(children=[housing,rotor])
            result,_=project(root,{'ground':housing})
            self.assertNotIn('mechanismDiagnostics',result)
            self.assertEqual(len(result['mechanism']['joints']),1)
            self.assertEqual(result['mechanismIntent']['rigidBodies']['occurrence:path/0/0'],['occurrence:path/0/0/0','occurrence:path/0/0/1'])
            # Symmetric retained pointers describe one edge, not a loop.
            joint.connected_to=target;target.connected_to=joint
            result,_=project(root,{'ground':housing})
            self.assertEqual(len(result['mechanismIntent']['connections']),1)
            root.children=[*root.children,Box(3,3,3)]
            result,_=project(root,{'ground':housing})
            self.assertNotIn('mechanism',result)
            self.assertIn('no connected native rigid body',result['mechanismDiagnostics'][0]['message'])
        a,b=Box(1,1,1),Box(1,1,1)
        source=RigidJoint('fixed',a);target=RigidJoint('mount',b)
        source.connect_to(target);b.move(Location((1,0,0)))
        result,_=project(Compound(children=[a,b]))
        self.assertIn('fixed connection',result['mechanismDiagnostics'][0]['message'])

    def test_rejects_stale_unknown_ambiguous_and_nonfinite_metadata(self):
        model=Gearbox();source,target=model.connections()[0]
        for value,message in [({'connections':{}},'sequence'),({'connections':[()]},'pair'),({'connections':[(source,object())]},'native Build123D'),
                              ({'connections':[(source,model.housing.joints['mount'])]},'distinct'),({'connections':[(source,target),(target,source)]},'repeat'),
                              ({'connections':[{'source':source}]},'record'),({'connections':[{'source':source,'target':target,'distance':1}]},'record')]:
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,message):project(model,value)
        old=target;RigidJoint('mount',model.rotor)
        with self.assertRaisesRegex(ValueError,'replaced'):project(model,{'connections':[(source,old)]})
        model=Gearbox();source,target=model.connections()[0]
        for reference in [(source,), (source,'bad'), (object(),'angle'), ((source,model.follower.joints['mount']),'angle'), (target,'distance')]:
            with self.subTest(reference=reference),self.assertRaises(ValueError):project(model,{'couplings':[{'driver':reference,'follower':(source,'angle'),'ratio':1}]})
        for entry in [None,{}, {'driver':(source,'angle'),'follower':(source,'angle'),'ratio':math.inf},
                      {'driver':(source,'angle'),'follower':(source,'angle'),'ratio':True},
                      {'driver':(source,'angle'),'follower':(source,'angle'),'ratio':1,'extra':0}]:
            with self.subTest(entry=entry),self.assertRaises(ValueError):project(model,{'couplings':[entry]})
        with self.assertRaisesRegex(ValueError,'finite native'):project(model,{'animations':[{'keyframes':[{'coordinates':{(source,'angle'):math.nan}}]}]})
        with self.assertRaisesRegex(ValueError,'occurrence_ids'):project(model,{'occurrence_ids':{'a':source.parent,'b':source.parent}})
        with self.assertRaisesRegex(ValueError,'occurrence_ids'):project(model,{'occurrence_ids':{'':source.parent}})


if __name__=='__main__':unittest.main()
