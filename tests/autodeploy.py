import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('auto',Path(__file__).parents[1]/'deploy/autodeploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha='a'*40
run={'head_sha':sha,'head_branch':'main','event':'push','path':m.WORKFLOW,'repository':{'full_name':m.REPO},'run_number':1,'status':'completed','conclusion':'success'}
assert m.eligible([run],sha)
assert not m.eligible([],sha)
for field,bad in [('head_sha','b'*40),('head_branch','feature'),('event','pull_request'),('path','.github/workflows/other.yml'),('repository',{'full_name':'other/repo'}),('status','in_progress'),('conclusion','failure')]:
 assert not m.eligible([{**run,field:bad}],sha),field
assert not m.eligible([run,{**run,'run_number':2,'conclusion':'failure'}],sha)
print('PASS autodeploy: only successful current-main release workflow is eligible')
