import struct, sys

def parse(path):
    d = open(path, 'rb').read()
    r = {}
    flags = struct.unpack_from('<I', d, 0x14)[0]
    r['HasLinkInfo'] = bool(flags & 0x2)
    r['HasName'] = bool(flags & 0x4)
    r['HasRelativePath'] = bool(flags & 0x8)
    r['HasWorkingDir'] = bool(flags & 0x10)
    r['HasArguments'] = bool(flags & 0x20)
    r['HasIconLocation'] = bool(flags & 0x40)
    r['IsUnicode'] = bool(flags & 0x80)

    pos = 0x4C  # 76 字节头
    if flags & 0x1:  # HasIDList
        while True:
            sz = struct.unpack_from('<H', d, pos)[0]
            if sz == 0:
                pos += 2
                break
            pos += sz
    # LinkInfo
    if r['HasLinkInfo']:
        li_size, li_hsize, li_flags, li_offv, li_offb, li_offn, li_offs = struct.unpack_from('<IIIIIII', d, pos)
        base = pos
        if li_flags & 0x1 and li_offb:  # VolumeIDAndLocalBasePath
            p = base + li_offb
            r['LocalBasePath'] = d[p:d.index(b'\0', p)].decode('mbcs', 'ignore')
        if li_flags & 0x2 and li_offn:  # CommonNetworkRelativeLinkAndPathSuffix
            p = base + li_offn
            r['CommonPathSuffix'] = d[p:d.index(b'\0', p)].decode('mbcs', 'ignore')
        if li_offs:
            p = base + li_offs
            r['Suffix'] = d[p:d.index(b'\0', p)].decode('mbcs', 'ignore')
        pos = base + li_size

    def read_str(pos):
        cnt = struct.unpack_from('<H', d, pos)[0]
        if r['IsUnicode']:
            s = d[pos + 2: pos + 2 + cnt * 2].decode('utf-16-le', 'ignore')
            return s, pos + 2 + cnt * 2
        s = d[pos + 2: pos + 2 + cnt].decode('mbcs', 'ignore')
        return s, pos + 2 + cnt

    if r['HasName']:
        r['Name'], pos = read_str(pos)
    if r['HasRelativePath']:
        r['RelativePath'], pos = read_str(pos)
    if r['HasWorkingDir']:
        r['WorkingDir'], pos = read_str(pos)
    if r['HasArguments']:
        r['Arguments'], pos = read_str(pos)
    if r['HasIconLocation']:
        r['IconLocation'], pos = read_str(pos)
    return r

for p in sys.argv[1:]:
    print('==', p)
    for k, v in parse(p).items():
        print('  %-16s %s' % (k, v))
