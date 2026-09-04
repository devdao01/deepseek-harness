"""Regenerate i18n/vi_VN.po from the module sources, references included.

Run from the repository root:  python3 apps/npei_agent_harness/tools/regenerate_i18n.py

Every PO entry needs `#:` reference lines — Odoo's PoFileReader iterates an
entry's occurrences and yields nothing for an entry that has none, so a
reference-less file imports as zero translations. This scans the module the
way Odoo's own export does and emits one entry per translatable source term:

* fields (`string=` / `help=` / Selection values) and `_description`
* `_sql_constraints` messages
* `_("...")` call sites in models, wizards, and controllers
* view arch attributes (string/placeholder/confirm/help/...), menu names,
  window/server action names, group names, and manifest metadata

Existing translations are carried over by msgid; terms with no translation yet
are reported as MISSING and left out (add them to the .po, or translate and
rerun). Terms whose source text disappeared are reported as UNUSED.
"""
import ast, json, os, re, sys
import xml.etree.ElementTree as ET

MOD = 'npei_agent_harness'
ROOT = 'apps/npei_agent_harness'

# ---- existing translations (msgid -> msgstr) -------------------------------
def read_po(path):
    src = open(path).read()
    pairs = {}
    for block in src.split('\n\n')[1:]:
        m = re.search(r'msgid ((?:"(?:[^"\\]|\\.)*"\s*)+)msgstr ((?:"(?:[^"\\]|\\.)*"\s*)+)', block)
        if not m:
            continue
        def unq(chunk):
            parts = re.findall(r'"((?:[^"\\]|\\.)*)"', chunk)
            return ''.join(p.replace('\\n','\n').replace('\\"','"').replace('\\\\','\\') for p in parts)
        pairs[unq(m.group(1))] = unq(m.group(2))
    return pairs

TRANS = read_po(f'{ROOT}/i18n/vi_VN.po')

# msgid -> set of reference lines
refs = {}
def add(msgid, ref, flag=None):
    if not msgid or not msgid.strip():
        return
    entry = refs.setdefault(msgid, {'refs': set(), 'flags': set()})
    entry['refs'].add(ref)
    if flag:
        entry['flags'].add(flag)

def model_slug(name):
    return name.replace('.', '_')

# ---- python: models, wizards ----------------------------------------------
def const_str(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None

def joined_str(node):
    """Constant, or implicit concatenation already folded by ast."""
    return const_str(node)

for dirpath, _dirs, files in os.walk(ROOT):
    if '/tests' in dirpath or '/i18n' in dirpath:
        continue
    for fname in sorted(files):
        if not fname.endswith('.py'):
            continue
        path = os.path.join(dirpath, fname)
        rel = os.path.relpath(path, ROOT)
        code_ref = f'code:addons/{MOD}/{rel}:0'
        tree = ast.parse(open(path).read())

        # _( "..." ) anywhere in the file
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == '_':
                if node.args:
                    text = joined_str(node.args[0])
                    if text:
                        add(text, code_ref, 'python-format' if '%' in text else None)

        for cls in [n for n in tree.body if isinstance(n, ast.ClassDef)]:
            model_name = None
            description = None
            constraints = None
            for stmt in cls.body:
                if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                    key = stmt.targets[0].id
                    if key == '_name':
                        model_name = const_str(stmt.value)
                    elif key == '_inherit' and model_name is None:
                        # An extension model (res.config.settings) translates
                        # its added fields under the inherited model's name.
                        model_name = const_str(stmt.value)
                    elif key == '_description':
                        description = const_str(stmt.value)
                    elif key == '_sql_constraints':
                        constraints = stmt.value
            if not model_name:
                continue
            slug = model_slug(model_name)
            if description:
                add(description, f'model:ir.model,name:{MOD}.model_{slug}')
            if isinstance(constraints, ast.List):
                for item in constraints.elts:
                    if isinstance(item, ast.Tuple) and len(item.elts) == 3:
                        cname = const_str(item.elts[0])
                        message = const_str(item.elts[2])
                        if cname and message:
                            add(message, f'model:ir.model.constraint,message:{MOD}.constraint_{slug}_{cname}')
            for stmt in cls.body:
                if not (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1
                        and isinstance(stmt.targets[0], ast.Name)
                        and isinstance(stmt.value, ast.Call)):
                    continue
                call = stmt.value
                if not (isinstance(call.func, ast.Attribute)
                        and isinstance(call.func.value, ast.Name) and call.func.value.id == 'fields'):
                    continue
                fname_ = stmt.targets[0].id
                ftype = call.func.attr
                label = None
                help_ = None
                selection = None
                if call.args:
                    first = call.args[0]
                    if ftype == 'Selection':
                        selection = first
                    else:
                        label = const_str(first)
                for kw in call.keywords:
                    if kw.arg == 'string':
                        label = const_str(kw.value) or label
                    elif kw.arg == 'help':
                        help_ = const_str(kw.value)
                    elif kw.arg == 'selection':
                        selection = kw.value
                if label:
                    add(label, f'model:ir.model.fields,field_description:{MOD}.field_{slug}__{fname_}')
                if help_:
                    add(help_, f'model:ir.model.fields,field_help:{MOD}.field_{slug}__{fname_}')
                if isinstance(selection, ast.List):
                    for item in selection.elts:
                        if isinstance(item, ast.Tuple) and len(item.elts) == 2:
                            value = const_str(item.elts[0])
                            text = const_str(item.elts[1])
                            if value is not None and text:
                                add(text, f'model:ir.model.fields.selection,name:{MOD}.selection__{slug}__{fname_}__{value}')

# ---- xml: views, menus, actions, groups ------------------------------------
VIEW_ATTRS = ('string', 'placeholder', 'confirm', 'help', 'title', 'text', 'sum', 'avg')

for dirpath, _dirs, files in os.walk(ROOT):
    if '/i18n' in dirpath:
        continue
    for fname in sorted(files):
        if not fname.endswith('.xml'):
            continue
        path = os.path.join(dirpath, fname)
        root = ET.parse(path).getroot()
        for record in root.iter('record'):
            model = record.get('model')
            xmlid = record.get('id')
            if not xmlid:
                continue
            if model == 'ir.ui.view':
                ref = f'model_terms:ir.ui.view,arch_db:{MOD}.{xmlid}'
                arch = record.find("./field[@name='arch']")
                if arch is None:
                    continue
                for el in arch.iter():
                    for attr in VIEW_ATTRS:
                        val = el.attrib.get(attr)
                        if val and not val.startswith('{'):
                            add(val, ref)
                    if el.text and el.text.strip() and el.tag in ('strong', 'span', 'p', 'div', 'h1', 'h2', 'b', 'i', 'label'):
                        add(el.text.strip(), ref)
            else:
                name_field = record.find("./field[@name='name']")
                name = (name_field.text or '').strip() if name_field is not None else ''
                target = {
                    'ir.actions.act_window': 'ir.actions.act_window',
                    'ir.actions.server': 'ir.actions.server',
                    'res.groups': 'res.groups',
                    'ir.actions.act_url': 'ir.actions.act_url',
                }.get(model or '')
                if target and name:
                    add(name, f'model:{target},name:{MOD}.{xmlid}')
                if model == 'res.groups':
                    comment = record.find("./field[@name='comment']")
                    if comment is not None and (comment.text or '').strip():
                        add(comment.text.strip(), f'model:res.groups,comment:{MOD}.{xmlid}')
        for menu in root.iter('menuitem'):
            xmlid = menu.get('id')
            name = menu.get('name')
            if xmlid and name:
                add(name, f'model:ir.ui.menu,name:{MOD}.{xmlid}')

# ---- manifest --------------------------------------------------------------
manifest = ast.literal_eval(open(f'{ROOT}/__manifest__.py').read())
if manifest.get('name'):
    add(manifest['name'], f'model:ir.module.module,shortdesc:{MOD}.module_meta_information')
if manifest.get('summary'):
    add(manifest['summary'], f'model:ir.module.module,summary:{MOD}.module_meta_information')
if manifest.get('description'):
    add(manifest['description'], f'model:ir.module.module,description:{MOD}.module_meta_information')

# ---- write -----------------------------------------------------------------
def esc(text):
    return text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

def po_string(text):
    if '\n' in text or len(text) > 74:
        parts = text.split('\n')
        lines = ['""']
        for i, part in enumerate(parts):
            suffix = '\\n' if i < len(parts) - 1 else ''
            lines.append(f'"{esc(part)}{suffix}"')
        return '\n'.join(lines)
    return f'"{esc(text)}"'

header = '''# Translation of Odoo Server.
# This file contains the translation of the following modules:
# \t* npei_agent_harness
#
msgid ""
msgstr ""
"Project-Id-Version: Odoo Server 17.0\\n"
"Report-Msgid-Bugs-To: \\n"
"POT-Creation-Date: 2026-09-04 00:00+0000\\n"
"PO-Revision-Date: 2026-09-04 00:00+0000\\n"
"Last-Translator: \\n"
"Language-Team: \\n"
"Language: vi_VN\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: \\n"
"Plural-Forms: nplurals=1; plural=0;\\n"
'''

blocks, missing, unused = [], [], []
for msgid in sorted(refs):
    msgstr = TRANS.get(msgid)
    if msgstr is None:
        missing.append(msgid)
        continue
    entry = refs[msgid]
    lines = [f'#. module: {MOD}']
    lines += [f'#: {ref}' for ref in sorted(entry['refs'])]
    if entry['flags']:
        lines.append('#, ' + ', '.join(sorted(entry['flags'])))
    lines.append(f'msgid {po_string(msgid)}')
    lines.append(f'msgstr {po_string(msgstr)}')
    blocks.append('\n'.join(lines) + '\n')

for msgid in TRANS:
    if msgid and msgid not in refs:
        unused.append(msgid)

open(f'{ROOT}/i18n/vi_VN.po', 'w').write(header + '\n' + '\n'.join(blocks))
print(f'written {len(blocks)} entries with references')
print(f'source terms without a translation: {len(missing)}')
for m in missing[:25]:
    print('  MISSING:', m[:90])
print(f'translations no longer matching any source term: {len(unused)}')
for m in unused[:15]:
    print('  UNUSED:', m[:90])
