"""Native placement, independent reuse and authored-coordinate assembly oracles."""
from __future__ import annotations

import copy
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build123d import Axis, BallJoint, Box, Compound, CylindricalJoint, LinearJoint, Location, RevoluteJoint, RigidJoint
from tau_assembly import Assembly
from mechanisms import _matrix, _wire, project_mechanism
from test_mechanisms import components, evaluate


def module(angle=30.):
    housing, rotor, follower = Box(4,5,6), Box(1,2,3), Box(2,3,4)
    RigidJoint('mount', housing, Location((1,2,3),(11,12,13)))
    RevoluteJoint('drive', housing, Axis((3,1,2),(0,0,1)), angular_range=(-2000,2000))
    RevoluteJoint('follow', housing, Axis((-3,1,2),(0,0,1)), angular_range=(-4000,4000))
    RigidJoint('mount', rotor, Location((0,1,0)))
    RigidJoint('mount', follower, Location((1,0,0)))
    RigidJoint('output', rotor, Location((0,2,1),(7,8,9)))
    result=Assembly(children={'housing':housing,'rotor':rotor,'follower':follower},label='Drive',base=housing)
    drive=result.connect('drive',housing.joints['drive'],rotor.joints['mount'],angle=angle)
    follow=result.connect('follow',housing.joints['follow'],follower.joints['mount'],angle=-2*angle+15)
    result.couple(driver=(drive,'angle'),follower=(follow,'angle'),ratio=-2,offset=15)
    result.expose_joint('mount',housing.joints['mount'])
    result.expose_joint('output',rotor.joints['output'])
    return result


def project(model, supplement=None):
    entries=components((model,))
    return project_mechanism((model,),entries,supplement),entries


class AssemblyTest(unittest.TestCase):
    def test_retains_authored_turns_phase_and_absolute_clips(self):
        model=module(390)
        drive=model.connections['drive']
        output,_=project(model,{'ground':model.parts['housing'],'animations':[{'id':'turn','duration':2,'keyframes':[
            {'time':0,'coordinates':{(drive,'angle'):390}}, {'time':2,'coordinates':{(drive,'angle'):750}}]}]})
        mechanism=output['mechanism']
        self.assertEqual(drive.coordinates,{'angle':390})
        self.assertEqual(output['mechanismIntent']['connections'][0]['referenceCoordinates'],{'angle':390})
        coupling=mechanism['couplings'][0]
        self.assertEqual(coupling,{'driver':'occurrence:0/connection/drive','follower':'occurrence:0/connection/follow','ratio':-2})
        self.assertEqual(mechanism['animations'][0]['keyframes'][1]['coordinates'],{coupling['driver']:360})
        self.assertEqual(mechanism['animations'][0]['keyframes'][0]['coordinates'],{coupling['driver']:0})
        self.assertEqual(len(model.solids()),3)
        self.assertAlmostEqual(sum(s.volume for s in model.solids()),150)

    def test_copy_and_moved_rebind_every_public_reference(self):
        original=module()
        original.move(Location((14,15,16),(17,18,19)))
        for method in (copy.copy,copy.deepcopy,lambda m:m.moved(Location((10,0,0),(0,0,20)))):
            with self.subTest(copy=method):
                duplicate=method(original)
                self.assertIsNot(duplicate.parts['rotor'],original.parts['rotor'])
                self.assertIs(duplicate.connections['drive'].source.parent,duplicate.parts['housing'])
                self.assertIs(duplicate.connections['drive'].target.parent,duplicate.parts['rotor'])
                self.assertIs(duplicate.interfaces['output'].joint.parent,duplicate.parts['rotor'])
                self.assertIs(duplicate.base,duplicate.parts['housing'])
                self.assertIs(duplicate._couplings[0].driver[0],duplicate.connections['drive'])
                self.assertEqual(len(duplicate.solids()),3)
                self.assertAlmostEqual(sum(s.volume for s in duplicate.solids()),150)
                projected,_=project(duplicate)
                self.assertNotIn('mechanismDiagnostics',projected)
        containing=Compound(children=[original])
        cloned=copy.deepcopy(containing).children[0]
        self.assertIs(cloned.interfaces['output'].joint.parent,cloned.parts['rotor'])
        self.assertIs(cloned.connections['drive'].assembly,cloned)
        detached=copy.copy(original)
        self.assertIsNone(detached.parent)
        self.assertIs(original.parent,containing)
        self.assertEqual(len(detached.solids()),3)

    def test_exposed_target_moves_whole_nested_module_and_output_follows_rotor(self):
        base, carrier, tool = Box(10,10,10),Box(8,8,2),Box(2,2,2)
        RevoluteJoint('carrier',base,Axis((20,0,0),(0,0,1)),angular_range=(-360,360))
        RigidJoint('mount',carrier)
        RigidJoint('left',carrier,Location((10,0,0),(20,30,40)))
        RigidJoint('right',carrier,Location((-10,0,0),(-20,10,30)))
        left=module(30); right=copy.copy(left)
        left.move(Location((3,4,5),(6,7,8)))
        moving=Assembly(children={'carrier':carrier,'left':left,'right':right})
        moving.expose_joint('mount',carrier.joints['mount'])
        moving.connect('left',carrier.joints['left'],left.interfaces['mount'])
        moving.connect('right',carrier.joints['right'],right.interfaces['mount'])
        moving.move(Location((7,8,9),(10,11,12)))
        model=Assembly(children={'base':base,'moving':moving,'tool':tool})
        model.connect('carrier',base.joints['carrier'],moving.interfaces['mount'],angle=30)
        RigidJoint('mount',tool,Location((1,2,3),(4,5,6)))
        model.connect('tool',left.interfaces['output'],tool.joints['mount'])
        result,entries=project(model,{'ground':base})
        self.assertNotIn('mechanismDiagnostics',result)
        for assembly in (left,right):
            expected=carrier.global_location*carrier.joints['left' if assembly is left else 'right'].relative_location
            actual=assembly.parts['housing'].global_location*assembly.interfaces['mount'].joint.relative_location
            np.testing.assert_allclose(_matrix(actual),_matrix(expected),atol=1e-10)
        mechanism=result['mechanism']
        states={'occurrence:0/connection/carrier':30,'occurrence:0/moving/left/connection/drive':25,
                'occurrence:0/moving/left/connection/follow':-50}
        poses=evaluate(mechanism,states)
        np.testing.assert_allclose(poses['occurrence:0/tool'],poses['occurrence:0/moving/left/rotor'],atol=1e-10)
        self.assertGreater(np.max(abs(poses['occurrence:0/moving/left/rotor']-poses['occurrence:0/moving/right/rotor'])),.2)
        base_record=next(c for c in result['mechanismIntent']['connections'] if c['id']=='occurrence:0/connection/carrier')
        owner=_matrix(base.global_location)
        joint=base.joints['carrier'];target=carrier.joints['mount']
        native_delta=owner@_matrix(copy.copy(joint).relative_to(copy.copy(target),angle=60))@np.linalg.inv(_matrix(copy.copy(joint).relative_to(copy.copy(target),angle=30)))@np.linalg.inv(owner)
        np.testing.assert_allclose(poses[base_record['child']['componentId']],np.array(_wire(native_delta)).reshape(4,4).T,atol=1e-10)
        alias=next(item for item in entries if item['id']=='occurrence:0/moving/left')['jointInterfaceAliases']['output']
        self.assertEqual(alias,{'componentId':'occurrence:0/moving/left/rotor','interfaceId':'output'})
        self.assertNotIn('output',left.joints)

    def test_mixed_units_convert_ratio_and_clip_from_millimetres(self):
        base,slider,rotor=Box(1,1,1),Box(1,1,1),Box(1,1,1)
        LinearJoint('slide',base,linear_range=(-100,100));RevoluteJoint('spin',base,angular_range=(-1000,1000))
        RigidJoint('mount',slider);RigidJoint('mount',rotor)
        model=Assembly(children={'base':base,'slider':slider,'rotor':rotor})
        slide=model.connect('slide',base.joints['slide'],slider.joints['mount'],position=10)
        spin=model.connect('spin',base.joints['spin'],rotor.joints['mount'],angle=25)
        model.couple(driver=(slide,'distance'),follower=(spin,'angle'),ratio=2,offset=5)
        result,_=project(model,{'animations':[{'id':'slide','duration':1,'keyframes':[{'time':0,'coordinates':{(slide,'distance'):10}},{'time':1,'coordinates':{(slide,'distance'):20}}]}]})
        self.assertEqual(result['mechanism']['couplings'][0]['ratio'],2000)
        self.assertEqual(result['mechanism']['animations'][0]['keyframes'][1]['coordinates'],{'occurrence:0/connection/slide':.01})
        self.assertEqual(result['mechanism']['joints']['occurrence:0/connection/slide']['limits'],{'lower':-.11,'upper':.09})

    def test_native_reverse_pairings_and_composed_ball_coordinates(self):
        for kind in ('rigid','revolute','linear','cylindrical','ball'):
            for reverse in (False,True):
                with self.subTest(kind=kind,reverse=reverse):
                    a,b=Box(1,1,1),Box(1,1,1)
                    if kind=='rigid': j=RigidJoint('j',a);state={}
                    elif kind=='revolute': j=RevoluteJoint('j',a,angular_range=(-1000,1000));state={'angle':390}
                    elif kind=='linear': j=LinearJoint('j',a,linear_range=(-100,100));state={'position':12}
                    elif kind=='cylindrical': j=CylindricalJoint('j',a,linear_range=(-100,100),angular_range=(-1000,1000));state={'position':12,'angle':390}
                    else: j=BallJoint('j',a,angular_range=((-180,180),(-90,90),(-180,180)));state={'angles':(10,20,30)}
                    mate=RigidJoint('mate',b)
                    model=Assembly(children={'a':a,'b':b})
                    source,target=(mate,j) if reverse else (j,mate)
                    handle=model.connect('test',source,target,**state)
                    output,_=project(model)
                    self.assertNotIn('mechanismDiagnostics',output)
                    self.assertEqual(set(output['mechanismIntent']['connections'][0]['referenceCoordinates']),set(handle.coordinates))
                    if kind=='revolute':self.assertEqual(handle.coordinates['angle'],390)

    def test_invalid_authoring_and_readonly_registries(self):
        with self.assertRaisesRegex(TypeError,'map occurrence'): Assembly(children=[])
        part=Box(1,1,1)
        for children in ({'':part},{'__proto__':part},{'bad':object()},{'a':part,'b':part}):
            with self.assertRaises(ValueError):Assembly(children=children)
        model=module()
        with self.assertRaisesRegex(ValueError,'unparented'):Assembly(children={'again':model.parts['rotor']})
        for mapping in (model.parts,model.connections,model.interfaces,model.connections['drive'].coordinates):
            with self.assertRaises(TypeError):mapping['bad']=None
        with self.assertRaisesRegex(ValueError,'already exists'):model.expose_joint('output',model.parts['rotor'].joints['output'])
        for joint in (object(),RigidJoint('own',model),RigidJoint('outside',Box(1,1,1))):
            with self.assertRaisesRegex(ValueError,'descendant'):model.expose_joint('bad',joint)
        outer=Assembly(children={'nested':model})
        outer.expose_joint('output',model.interfaces['output'])
        self.assertIs(outer.interfaces['output'].joint,model.interfaces['output'].joint)
        with self.assertRaisesRegex(ValueError,'already exists'):model.connect('drive',object(),object())
        with self.assertRaisesRegex(ValueError,'endpoints'):model.connect('bad',object(),object())
        with self.assertRaisesRegex(ValueError,'own source'):model.connect('self',model.parts['rotor'].joints['output'],model.parts['rotor'].joints['mount'])
        source,target=model.parts['housing'].joints['drive'],model.parts['rotor'].joints['mount']
        for state,message in (({'typo':0},'coordinates are'),({'angle':math.nan},'finite numbers'),({'angle':True},'finite numbers'),({'angle':10000},'range')):
            with self.subTest(state=state),self.assertRaisesRegex(ValueError,message):model.connect('invalid',source,target,**state)
        d,f=model.connections['drive'],model.connections['follow']
        outside=module().connections['drive']
        for kwargs,message in (({'driver':d,'follower':(f,'angle'),'ratio':1},'coordinate reference'),
            ({'driver':(d,'bad'),'follower':(f,'angle'),'ratio':1},'coordinate reference'),
            ({'driver':(outside,'angle'),'follower':(f,'angle'),'ratio':1},'belong'),
            ({'driver':(d,'angle'),'follower':(f,'angle'),'ratio':0},'finite'),
            ({'driver':(d,'angle'),'follower':(f,'angle'),'ratio':1},'competing'),
            ({'driver':(f,'angle'),'follower':(d,'angle'),'ratio':1},'cycle'),
            ({'driver':(d,'angle'),'follower':(d,'angle'),'ratio':1},'cycle')):
            with self.subTest(kwargs=kwargs),self.assertRaisesRegex(ValueError,message):model.couple(**kwargs)
        fresh=module();fresh._couplings.clear()
        with self.assertRaisesRegex(ValueError,'phase'):fresh.couple(driver=(fresh.connections['drive'],'angle'),follower=(fresh.connections['follow'],'angle'),ratio=1)

    def test_mutated_membership_joint_ownership_and_invalid_clip_references_rejected(self):
        model=module();model.children=model.children[:-1]
        with self.assertRaisesRegex(ValueError,'children changed'):project(model)
        for mutation in ('replace','remove','frame'):
            model=module();joint=model.parts['housing'].joints['drive']
            if mutation=='replace':RevoluteJoint('drive',model.parts['housing'])
            elif mutation=='remove':del model.parts['housing'].joints['drive']
            else:joint.relative_axis=Axis.X
            with self.subTest(mutation=mutation),self.assertRaisesRegex(ValueError,'changed|removed'):project(model)
        model=module();del model.parts['rotor'].joints['output']
        with self.assertRaisesRegex(ValueError,'exposed native joint'):project(model)
        model=module()
        for key,value,message in (((module().connections['drive'],'angle'),0,'exported'),((model.connections['drive'],'angle'),math.nan,'finite native')):
            with self.assertRaisesRegex(ValueError,message):project(model,{'animations':[{'id':'x','duration':1,'keyframes':[{'time':0,'coordinates':{key:value}}]}]})

    def test_passive_siblings_follow_local_base_including_moving_output_mount(self):
        for mount_output in (False, True):
            housing,rotor,screw=Box(4,4,4),Box(2,2,2),Box(1,1,1)
            RevoluteJoint('drive',housing,angular_range=(-720,720));RigidJoint('mount',rotor)
            RigidJoint('mount',housing);RigidJoint('output',rotor)
            unit=Assembly(children={'housing':housing,'rotor':rotor,'screw':screw},base=housing)
            drive=unit.connect('drive',housing.joints['drive'],rotor.joints['mount'],angle=30)
            unit.expose_joint('mount',rotor.joints['output'] if mount_output else housing.joints['mount'])
            base=Box(10,10,10);RevoluteJoint('carrier',base,angular_range=(-720,720))
            model=Assembly(children={'base':base,'unit':unit})
            model.connect('carrier',base.joints['carrier'],unit.interfaces['mount'],angle=30)
            result,_=project(model,{'ground':base})
            self.assertNotIn('mechanismDiagnostics',result)
            self.assertIn('occurrence:0/unit/screw',result['mechanism']['links']['occurrence:0/unit/housing']['components'])
            self.assertNotIn('occurrence:0/unit/screw',result['mechanism']['links']['occurrence:0/base']['components'])
            poses=evaluate(result['mechanism'],{'occurrence:0/connection/carrier':30,'occurrence:0/unit/connection/drive':20})
            self.assertGreater(np.max(abs(poses['occurrence:0/unit/housing']-np.eye(4))),.1)

    def test_static_exposed_module_and_ambiguous_base_diagnostics(self):
        base,a,b=Box(3,3,3),Box(2,2,2),Box(1,1,1)
        RigidJoint('mount',a);RevoluteJoint('drive',base,angular_range=(-360,360))
        unit=Assembly(children={'a':a,'b':b});unit.expose_joint('mount',a.joints['mount'])
        root=Assembly(children={'base':base,'unit':unit});root.connect('unit',base.joints['drive'],unit.interfaces['mount'],angle=0)
        result,_=project(root)
        self.assertIn('occurrence:0/unit/b',result['mechanism']['links']['occurrence:0/unit/a']['components'])
        # Two independent internal trees cannot choose the body of a passive sibling.
        p=[Box(1,1,1) for _ in range(5)]
        ambiguous=Assembly(children={str(i):part for i,part in enumerate(p)})
        for i in (0,2):
            RevoluteJoint('j',p[i],angular_range=(-360,360));RigidJoint('j',p[i+1])
            ambiguous.connect(str(i),p[i].joints['j'],p[i+1].joints['j'],angle=0)
        output,_=project(ambiguous,{'ground':p[0]})
        self.assertNotIn('mechanism',output)
        self.assertTrue(any('local base' in d['message'] for d in output['mechanismDiagnostics']))

    def test_stale_fixed_and_ball_poses_retain_authored_intent(self):
        for ball in (False,True):
            a,b=Box(1,1,1),Box(1,1,1)
            source=BallJoint('j',a,angular_range=((-180,180),(-90,90),(-180,180))) if ball else RigidJoint('j',a)
            target=RigidJoint('j',b);model=Assembly(children={'a':a,'b':b})
            handle=model.connect('edge',source,target,**({'angles':(0,0,0)} if ball else {}))
            b.move(Location((0,0,0),(0,0,30)) if ball else Location((10,0,0)))
            output,_=project(model)
            self.assertNotIn('mechanism',output)
            self.assertEqual(output['mechanismDiagnostics'][0]['code'],'UNSUPPORTED_MECHANISM')
            self.assertEqual(output['mechanismIntent']['connections'][0]['referenceCoordinates'],dict(handle.coordinates))

    def test_retains_multiple_edges_loops_and_couplings_without_playback(self):
        a,b,c=Box(1,1,1),Box(1,1,1),Box(1,1,1)
        RevoluteJoint('d',a,angular_range=(-720,720));RevoluteJoint('f',a,angular_range=(-720,720))
        RigidJoint('mount',b);RigidJoint('mount',c)
        model=Assembly(children={'a':a,'b':b,'c':c})
        d=model.connect('d',a.joints['d'],b.joints['mount'],angle=0)
        f=model.connect('f',a.joints['f'],c.joints['mount'],angle=0)
        model.couple(driver=(d,'angle'),follower=(f,'angle'),ratio=2)
        # Native last-edge coexistence is deduplicated by physical endpoint identity.
        a.joints['d'].connect_to(b.joints['mount'],angle=0)
        self.assertEqual(len(project(model)[0]['mechanismIntent']['connections']),2)
        RigidJoint('loop',b);RigidJoint('loop',c)
        model.connect('loop',b.joints['loop'],c.joints['loop'])
        output,_=project(model,{'ground':a})
        self.assertNotIn('mechanism',output)
        self.assertEqual(len(output['mechanismIntent']['connections']),3)
        self.assertEqual(output['mechanismIntent']['couplings'][0]['ratio'],2)
        # Deliberately breaking an endpoint pose keeps both coupling intent and the diagnostic.
        b.move(Location((1,0,0)))
        output,_=project(model,{'ground':a})
        self.assertNotIn('mechanism',output)
        self.assertEqual(output['mechanismIntent']['connections'][0]['referenceCoordinates'],{'angle':0})

    def test_long_coupling_chain_and_phase_revalidation(self):
        base=Box(1,1,1);parts=[Box(1,1,1) for _ in range(3)]
        model=Assembly(children={'base':base,**{str(i):p for i,p in enumerate(parts)}})
        handles=[]
        for i,part in enumerate(parts):
            RevoluteJoint(str(i),base,angular_range=(-720,720));RigidJoint('mount',part)
            handles.append(model.connect(str(i),base.joints[str(i)],part.joints['mount'],angle=0))
        model.couple(driver=(handles[0],'angle'),follower=(handles[1],'angle'),ratio=1)
        model.couple(driver=(handles[1],'angle'),follower=(handles[2],'angle'),ratio=1)
        with self.assertRaisesRegex(ValueError,'cycle'):
            model.couple(driver=(handles[2],'angle'),follower=(handles[0],'angle'),ratio=1)
        # Export rechecks independently of the constructor, including retained references.
        from dataclasses import replace
        model._couplings[0]=replace(model._couplings[0], offset=10)
        with self.assertRaisesRegex(ValueError,'phase'):project(model)

    def test_native_defaults_invalid_coordinates_and_mounted_containment(self):
        a,b=Box(1,1,1),Box(1,1,1)
        RevoluteJoint('j',a,angular_range=(-math.inf,math.inf));RigidJoint('j',b)
        model=Assembly(children={'a':a,'b':b})
        with self.assertRaisesRegex(ValueError,'finite reference'):model.connect('unset',a.joints['j'],b.joints['j'])
        RigidJoint('fixed',a)
        with self.assertRaisesRegex(ValueError,'not available'):model.connect('bad',a.joints['fixed'],b.joints['j'],angle=0)
        base=Box(1,1,1);RigidJoint('j',base)
        rotor=Box(1,1,1);RigidJoint('j',rotor)
        unit=Assembly(children={'rotor':rotor});RigidJoint('mount',unit);RevoluteJoint('shaft',unit,angular_range=(-360,360))
        unit.connect('drive',unit.joints['shaft'],rotor.joints['j'],angle=0)
        root=Assembly(children={'base':base,'unit':unit});root.connect('mount',base.joints['j'],unit.joints['mount'])
        result,_=project(root)
        self.assertNotIn('mechanismDiagnostics',result)
        self.assertEqual(len(result['mechanism']['joints']),2)


    def test_explicit_base_is_independent_of_connection_direction_and_external_port(self):
        for reverse in (False,True):
            for output_mount in (False,True):
                housing,rotor,cover=Box(2,2,2),Box(1,1,1),Box(3,3,1)
                # Both native directions describe the same bodies; local rigid ownership is explicit.
                if reverse:
                    source=RevoluteJoint('shaft',rotor,angular_range=(-720,720));target=RigidJoint('shaft',housing)
                else:
                    source=RevoluteJoint('shaft',housing,angular_range=(-720,720));target=RigidJoint('shaft',rotor)
                RigidJoint('mount',housing);RigidJoint('output',rotor)
                unit=Assembly(children={'housing':housing,'rotor':rotor,'cover':cover},base=housing)
                unit.connect('shaft',source,target,angle=0)
                unit.expose_joint('port',rotor.joints['output'] if output_mount else housing.joints['mount'])
                unit=copy.deepcopy(unit)
                base=Box(5,5,5);RevoluteJoint('mount',base,angular_range=(-720,720))
                root=Assembly(children={'base':base,'module':unit})
                root.connect('mount',base.joints['mount'],unit.interfaces['port'],angle=30)
                result,_=project(root,{'ground':base})
                self.assertNotIn('mechanismDiagnostics',result)
                self.assertIs(unit.base,unit.parts['housing'])
                self.assertIn('occurrence:0/module/cover',result['mechanism']['links']['occurrence:0/module/housing']['components'])
                poses=evaluate(result['mechanism'],{'occurrence:0/connection/mount':30,'occurrence:0/module/connection/shaft':20})
                self.assertFalse(np.allclose(poses['occurrence:0/module/housing'],poses['occurrence:0/module/rotor']))

    def test_base_and_exposed_reference_membership_validation(self):
        from tau_assembly import JointInterface
        with self.assertRaisesRegex(ValueError,'owned descendant'):Assembly(children={'part':Box(1,1,1)},base=Box(1,1,1))
        model=module()
        with self.assertRaises(AttributeError):model.base=model.parts['rotor']
        foreign=module()
        with self.assertRaisesRegex(ValueError,'Exposed connection endpoint'):
            model.connect('bad',model.parts['housing'].joints['drive'],foreign.interfaces['mount'])
        # Public native mutation may detach/replace interfaces; projection must not lie.
        model._interfaces['foreign']=JointInterface(model,foreign.parts['housing'].joints['mount'])
        with self.assertRaisesRegex(ValueError,'descendant occurrence'):project(model)
        model=module();model._base=foreign.parts['housing']
        with self.assertRaisesRegex(ValueError,'remain an owned'):project(model)
        model=module();passive=Box(1,1,1)
        root=Assembly(children={'module':model,'passive':passive},base=passive)
        with self.assertRaisesRegex(ValueError,'participate'):project(root)
        model=module();joint=model.connections['drive'].source
        old=joint.parent;new=Box(1,1,1);del old.joints[joint.label];joint.parent=new;new.joints[joint.label]=joint
        with self.assertRaisesRegex(ValueError,'outside the returned'):project(model)


    def test_native_compound_mount_and_passive_subtree_preserve_body_ownership(self):
        base,housing,rotor,cover=Box(5,5,5),Box(2,2,2),Box(1,1,1),Box(3,3,1)
        passive=Assembly(children={'cover':cover})
        RevoluteJoint('drive',housing,angular_range=(-360,360));RigidJoint('mount',rotor)
        unit=Assembly(children={'housing':housing,'rotor':rotor,'passive':passive})
        RigidJoint('mount',unit);RigidJoint('mount',base)
        unit.connect('drive',housing.joints['drive'],rotor.joints['mount'],angle=0)
        root=Assembly(children={'base':base,'unit':unit})
        root.connect('mount',base.joints['mount'],unit.joints['mount'])
        output,_=project(root)
        self.assertNotIn('mechanismDiagnostics',output)
        self.assertEqual(output['mechanism']['joints']['occurrence:0/unit/housing/mount']['parent'],'occurrence:0/unit')
        self.assertIn('occurrence:0/unit/passive/cover',output['mechanism']['links']['occurrence:0/unit']['components'])
        self.assertEqual(output['mechanismIntent']['rigidBodies'],{key:body['components'] for key,body in output['mechanism']['links'].items()})

    def test_unsupported_loop_roundtrip_retains_explicit_rigid_body_membership(self):
        import json
        projections=[]
        for on_rotor in (False,True):
            housing,rotor,cover=Box(2,2,2),Box(1,1,1),Box(3,3,1)
            RevoluteJoint('drive',housing,angular_range=(-360,360));RigidJoint('mount',rotor)
            RevoluteJoint('loop',housing,angular_range=(-360,360));RigidJoint('loop',rotor)
            unit=Assembly(children={'housing':housing,'rotor':rotor,'cover':cover},base=rotor if on_rotor else housing)
            unit.connect('drive',housing.joints['drive'],rotor.joints['mount'],angle=0)
            unit.connect('loop',housing.joints['loop'],rotor.joints['loop'],angle=0)
            output,_=project(unit,{'ground':housing})
            self.assertNotIn('mechanism',output)
            restored=json.loads(json.dumps(output))
            key='occurrence:0/rotor' if on_rotor else 'occurrence:0/housing'
            self.assertIn('occurrence:0/cover',restored['mechanismIntent']['rigidBodies'][key])
            self.assertTrue(all('/virtual/' not in key for key in restored['mechanismIntent']['rigidBodies']))
            projections.append(restored)
        self.assertNotEqual(projections[0]['mechanismIntent']['rigidBodies'],projections[1]['mechanismIntent']['rigidBodies'])


    def test_named_virtual_occurrences_remain_physical_roots(self):
        for name in ('module','virtual','connection','angle'):
            unit=module()
            root=Assembly(children={name:unit})
            output,_=project(root)
            self.assertNotIn('mechanismDiagnostics',output)
            self.assertEqual(output['mechanism']['root'],f'occurrence:0/{name}/housing')


    def test_virtual_factor_ids_cannot_collide_with_named_physical_occurrences(self):
        base,ball,extra=Box(3,3,3),Box(2,2,2),Box(1,1,1)
        nested=Assembly(children={'bearing':Assembly(children={'virtual':Assembly(children={'0':extra})})})
        BallJoint('ball',base,angular_range=((-180,180),(-90,90),(-180,180)));RigidJoint('mount',ball)
        RevoluteJoint('extra',base,angular_range=(-360,360));RigidJoint('mount',extra)
        root=Assembly(children={'base':base,'ball':ball,'connection':nested})
        root.connect('bearing',base.joints['ball'],ball.joints['mount'],angles=(0,0,0))
        root.connect('extra',base.joints['extra'],extra.joints['mount'],angle=0)
        output,entries=project(root)
        self.assertNotIn('mechanismDiagnostics',output)
        physical='occurrence:0/connection/bearing/virtual/0'
        self.assertIn(physical,output['mechanism']['links'])
        self.assertEqual(len(output['mechanism']['links']),5)
        virtual=[key for key in output['mechanism']['links'] if key.startswith('virtual:')]
        self.assertEqual(len(virtual),2)
        self.assertFalse(set(virtual)&{entry['id'] for entry in entries})
        self.assertFalse(set(virtual)&set(output['mechanismIntent']['rigidBodies']))



if __name__=='__main__':unittest.main()
