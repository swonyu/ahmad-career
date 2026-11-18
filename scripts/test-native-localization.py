#!/usr/bin/env python3
"""Validate resource-generation boundaries without claiming a native runtime run."""
from pathlib import Path
import importlib.util,json,re,unittest,xml.etree.ElementTree as ET
spec=importlib.util.spec_from_file_location('generator',Path(__file__).with_name('generate-native-localization.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class NativeResourceContract(unittest.TestCase):
    def catalog(self,values):return {'source_language':'en','target_language':'ar','strings':values}
    def test_missing_or_changed_arguments_are_rejected(self):
        with self.assertRaisesRegex(AssertionError,'Placeholder mismatch'):
            g.generate(self.catalog({'Use {0} with {1}':'استخدم {0}'}))
    def test_repeated_and_nonsequential_source_arguments_are_rejected(self):
        for source in ['Use {0} with {0}','Use {1}','Use {1} then {0}']:
            with self.assertRaises(AssertionError):g.generate(self.catalog({source:source}))
    def test_translation_can_reorder_arguments_without_changing_identity(self):
        output,_=g.generate(self.catalog({'Record {0} from {1}':'من {1}، السجل {0}'}))
        self.assertIn('من {1}، السجل {0}',output['apple/AhmadCareer/ar.lproj/Localizable.strings'])
    def test_adjacent_arguments_are_explicit_only_and_broad_templates_are_excluded(self):
        _,templates=g.generate(self.catalog({'Preparation {0}{1}':'التحضير {0}{1}','{0}: {1}':'{0}: {1}','Role {0} checked at {1}.':'الدور {0}، جرى التحقق في {1}.'}))
        self.assertEqual([x['key'] for x in templates],['Role {0} checked at {1}.'])
    def test_most_specific_template_precedes_a_general_prefix(self):
        _,templates=g.generate(self.catalog({'Saved {0}':'حُفظ {0}','Saved {0} on this phone.':'حُفظ {0} على هذا الهاتف.'}))
        self.assertEqual(templates[0]['key'],'Saved {0} on this phone.')
    def test_platform_escaping_preserves_quotes_spaces_and_newlines(self):
        values={'Prefix ':'بادئة ','The "record"\nIsn\'t changed':'«السجل»\nلم يتغير'}
        out,_=g.generate(self.catalog(values))
        tree=ET.fromstring(out['android/app/src/main/res/values-ar/career_copy.xml'])
        self.assertTrue(all((x.text or '').startswith('"') and (x.text or '').endswith('"') for x in tree))
        self.assertTrue(any(x.text=='"بادئة "' for x in tree))
        # Each Cocoa entry is emitted as a pair of valid JSON-escaped Unicode strings.
        lines=out['apple/AhmadCareer/en.lproj/Localizable.strings'].splitlines()[1:]
        decoded={}
        for line in lines:
            key,end=json.JSONDecoder().raw_decode(line)
            value=json.loads(line[end+3:-1]);decoded[key]=value
        self.assertEqual(decoded,{k:k for k in values})
    def test_newline_and_boundary_space_loss_is_rejected(self):
        for source,target in [('One\nTwo','واحد اثنان'),('Prefix ','بادئة'),(' suffix','لاحقة')]:
            with self.assertRaises(AssertionError):g.generate(self.catalog({source:target}))
    def test_checked_in_artifacts_are_current_and_protocol_keys_are_excluded(self):
        catalog=json.loads((g.ROOT/'localization/native-copy.json').read_text())
        forbidden={'Cookie','Authorization','Cache-Control','AndroidKeyStore','CFBundleVersion','CFBundleShortVersionString'}
        self.assertFalse(forbidden.intersection(catalog['strings']))
        outputs,templates=g.generate(catalog)
        for name,content in outputs.items():self.assertEqual((g.ROOT/name).read_text(),content,name)
        for t in templates:
            self.assertEqual(len(t['parts']),t['arguments']+1)
            self.assertTrue(all(t['parts'][1:-1]))

if __name__=='__main__':unittest.main()
