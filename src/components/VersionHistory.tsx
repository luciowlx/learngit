import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ArrowUpDown, Search, Eye, GitCompare, RotateCcw, ArrowLeft, GitBranch, GitMerge, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import VersionDetail from './VersionDetail';
import VersionCompare from './VersionCompare';

interface Version {
  id: string;
  versionNumber: string;
  source: '上传' | '订阅' | '清洗';
  createTime: string;
  creator: string;
  size: string;
  status: '成功' | '失败';
  description?: string;
  fieldCount: number;
  sampleCount: number;
  missingRate: number;
  anomalyRate: number;
  rules?: string[];
  tags?: string[]; // 新增：数据标签（可选）
}

interface VersionHistoryProps {
  datasetId: string;
  datasetName: string;
  onBack: () => void;
  onSwitchVersion: (version: Version) => void;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({ datasetId, datasetName, onBack, onSwitchVersion }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
  const [isRollbackDialogOpen, setIsRollbackDialogOpen] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState<Version | null>(null);
  const [isVersionDetailOpen, setIsVersionDetailOpen] = useState(false);
  const [selectedVersionForDetail, setSelectedVersionForDetail] = useState<Version | null>(null);
  const [isVersionCompareOpen, setIsVersionCompareOpen] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[Version, Version] | null>(null);
  const [graphScale, setGraphScale] = useState(1);

// 版本关系边（用于横向树：父 -> 子）
const edges: { parent: string; child: string; type?: 'branch' | 'merge' }[] = [
  { parent: '1', child: '2', type: 'branch' },
  { parent: '1', child: '3', type: 'branch' },
  { parent: '2', child: '4', type: 'branch' },
];

// 模拟版本数据
const [versions] = useState<Version[]>([
  {
    id: '1',
    versionNumber: 'v1.0',
    source: '上传',
    createTime: '2024-01-15 10:30:00',
    creator: '张三',
    size: '2.5MB',
    status: '成功',
    description: '初始版本',
    fieldCount: 15,
    sampleCount: 10000,
    missingRate: 5.2,
    anomalyRate: 2.1,
    rules: ['缺失值填充', '异常值处理']
  },
  {
    id: '2',
    versionNumber: 'v1.1',
    source: '清洗',
    createTime: '2024-01-16 14:20:00',
    creator: '李四',
    size: '2.3MB',
    status: '成功',
    description: '数据清洗后版本',
    fieldCount: 15,
    sampleCount: 9800,
    missingRate: 0.8,
    anomalyRate: 0.5,
    rules: ['缺失值填充', '异常值处理', '数据标准化'],
    tags: ['清洗后', '低缺失', '标准化']
  },
  {
    id: '3',
    versionNumber: 'v1.2',
    source: '订阅',
    createTime: '2024-01-17 09:15:00',
    creator: '王五',
    size: '2.8MB',
    status: '成功',
    description: '订阅更新版本',
    fieldCount: 16,
    sampleCount: 11200,
    missingRate: 3.1,
    anomalyRate: 1.8,
    rules: ['自动同步']
  },
  {
    id: '4',
    versionNumber: 'v1.3',
    source: '清洗',
    createTime: '2024-01-18 16:45:00',
    creator: '赵六',
    size: '0MB',
    status: '失败',
    description: '清洗失败',
    fieldCount: 0,
    sampleCount: 0,
    missingRate: 0,
    anomalyRate: 0,
    rules: [],
    tags: ['清洗失败']
  }
]);

// 筛选和排序逻辑
const filteredVersions = versions
  .filter(version => {
    const matchesSearch = version.versionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          version.creator.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || version.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || version.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  })
  .sort((a, b) => {
    let aValue: any = a[sortBy as keyof Version];
    let bValue: any = b[sortBy as keyof Version];
    if (sortBy === 'createTime') {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    }
    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleGraphSelect = (id: string) => {
    setSelectedVersions(prev => {
      if (prev.includes(id)) return prev.filter(v => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  // 可视化组件：横向版本树（SVG）
  const VersionGraph: React.FC<{
    versions: Version[];
    filteredVersions: Version[];
    edges: { parent: string; child: string; type?: 'branch' | 'merge' }[];
    selectedVersions: string[];
    onSelect: (id: string) => void;
    onSwitchVersion: (v: Version) => void;
    scale: number;
    onScaleChange: (s: number) => void;
  }> = ({ versions, filteredVersions, edges, selectedVersions, onSelect, onSwitchVersion, scale, onScaleChange }) => {
    // 计算横向布局：按父子关系分层，x 随层级递增，y 在每层内按顺序垂直分布
    const idSet = new Set(versions.map(v => v.id));
    const childSet = new Set(edges.map(e => e.child));
    const parentSet = new Set(edges.map(e => e.parent));
    const rootId = [...parentSet].find(id => !childSet.has(id)) || versions[0]?.id;

    const childrenMap = new Map<string, string[]>();
    edges.forEach(({ parent, child }) => {
      if (!childrenMap.has(parent)) childrenMap.set(parent, []);
      childrenMap.get(parent)!.push(child);
    });

    const depth = new Map<string, number>();
    if (rootId) depth.set(rootId, 0);
    const queue: string[] = rootId ? [rootId] : [];
    while (queue.length) {
      const current = queue.shift()!;
      const d = depth.get(current)!;
      (childrenMap.get(current) || []).forEach(child => {
        if (!depth.has(child)) {
          depth.set(child, d + 1);
          queue.push(child);
        }
      });
    }
    // 未包含在边中的节点，默认放在根层之后
    versions.forEach(v => { if (!depth.has(v.id)) depth.set(v.id, 0); });

    const levelNodes = new Map<number, string[]>();
    depth.forEach((d, id) => {
      if (!levelNodes.has(d)) levelNodes.set(d, []);
      levelNodes.get(d)!.push(id);
    });
    // 每层按创建时间排序，保证时间序
    levelNodes.forEach((ids, level) => {
      ids.sort((a, b) => {
        const va = versions.find(v => v.id === a)!;
        const vb = versions.find(v => v.id === b)!;
        return new Date(va.createTime).getTime() - new Date(vb.createTime).getTime();
      });
    });

    const positions = new Map<string, { x: number; y: number }>();
    const baseX = 100;
    const baseY = 80;
    const gapX = 220;
    const gapY = 120;

    let maxLevel = 0;
    let maxCountInLevel = 0;
    levelNodes.forEach((ids, level) => {
      maxLevel = Math.max(maxLevel, level);
      maxCountInLevel = Math.max(maxCountInLevel, ids.length);
      ids.forEach((id, idx) => {
        positions.set(id, { x: baseX + level * gapX, y: baseY + idx * gapY });
      });
    });

    const isVisible = (id: string) => filteredVersions.some(v => v.id === id);

    const pathCurveH = (from: { x: number; y: number }, to: { x: number; y: number }) => `M ${from.x} ${from.y} C ${from.x + 80} ${from.y}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`;

    const width = baseX + (maxLevel + 1) * gapX + 300;
    const height = baseY + Math.max(maxCountInLevel, levelNodes.get(0)?.length || 1) * gapY + 60;

    return (
      <div className="relative border rounded-lg bg-white">
        <div className="absolute left-2 top-2 z-10 flex items-center space-x-2 bg-white/90 backdrop-blur px-2 py-1 rounded shadow text-xs">
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => onScaleChange(Math.max(0.6, scale - 0.1))}>
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span>{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => onScaleChange(Math.min(2, scale + 0.1))}>
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>

        <div className="overflow-auto" style={{ height: 360 }}>
          <svg width={width} height={height} style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            {/* 边：父->子，使用横向贝塞尔曲线 */}
            {edges.map((e, idx) => {
              const fromPos = positions.get(e.parent);
              const toPos = positions.get(e.child);
              if (!fromPos || !toPos) return null;
              return (
                <path
                  key={`edge-${idx}`}
                  d={pathCurveH(fromPos, toPos)}
                  fill="none"
                  stroke={e.type === 'merge' ? '#8B5CF6' : '#60A5FA'}
                  strokeWidth={2}
                  strokeDasharray={e.type === 'merge' ? '4 4' : '0'}
                />
              );
            })}

            {/* 节点与标签（点击切换版本） */}
            {versions.map((v) => {
              const pos = positions.get(v.id);
              if (!pos) return null;
              const success = v.status === '成功';
              const visible = isVisible(v.id);
              const selected = selectedVersions.includes(v.id);
              const circleColor = success ? '#10B981' : '#EF4444';
              const ringColor = selected ? '#2563EB' : '#111827';
              return (
                <g key={v.id} onClick={() => onSwitchVersion(v)} cursor="pointer" opacity={visible ? 1 : 0.35}>
                  <circle cx={pos.x} cy={pos.y} r={10} fill={circleColor} stroke={ringColor} strokeWidth={selected ? 3 : 2} />
                  <text x={pos.x + 18} y={pos.y - 2} fontSize={12} fill="#111827">{v.versionNumber}</text>
                  <text x={pos.x + 18} y={pos.y + 12} fontSize={11} fill="#6B7280">{v.createTime}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleViewDetail = (version: Version) => {
    setSelectedVersionForDetail(version);
    setIsVersionDetailOpen(true);
  };

  const handleCompare = () => {
    if (selectedVersions.length !== 2) {
      toast.error('请选择两个版本进行对比');
      return;
    }
    const version1 = versions.find(v => v.id === selectedVersions[0]);
    const version2 = versions.find(v => v.id === selectedVersions[1]);
    if (version1 && version2) {
      setCompareVersions([version1, version2]);
      setIsVersionCompareOpen(true);
    }
  };

  const handleRollback = (version: Version) => {
    setRollbackVersion(version);
    setIsRollbackDialogOpen(true);
  };

  const confirmRollback = () => {
    if (rollbackVersion) {
      toast.success(`已回退到版本 ${rollbackVersion.versionNumber}`);
      setIsRollbackDialogOpen(false);
      setRollbackVersion(null);
    }
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant={status === '成功' ? 'default' : 'destructive'}>
        {status}
      </Badge>
    );
  };

  const getSourceBadge = (source: string) => {
    const variants = {
      '上传': 'secondary',
      '订阅': 'outline',
      '清洗': 'default'
    } as const;
    return (
      <Badge variant={variants[source as keyof typeof variants]}>
        {source}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">版本历史</h1>
            <p className="text-gray-600">{datasetName}</p>
          </div>
        </div>
        <Button onClick={handleCompare} disabled={selectedVersions.length !== 2}>
          <GitCompare className="h-4 w-4 mr-2" />
          版本对比
        </Button>
      </div>

      {/* 版本树（新增：可视化 + 保留文本描述） */}
      <Card>
        <CardHeader>
          <CardTitle>版本树</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              {/* 可视化演进图 */}
              <VersionGraph
                versions={versions}
                filteredVersions={filteredVersions}
                edges={edges}
                selectedVersions={selectedVersions}
                onSelect={handleGraphSelect}
                onSwitchVersion={(v) => onSwitchVersion(v)}
                scale={graphScale}
                onScaleChange={setGraphScale}
              />
            </div>

            <div>
              {/* 文本描述（保留原有样式） */}
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-700">
                  <GitBranch className="h-4 w-4 mr-2 text-blue-600" /> 主干 main
                </div>
                <div className="ml-6 space-y-3">
                  <div className="relative pl-4">
                    <div className="absolute left-0 top-2 bottom-2 border-l-2 border-gray-200" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">v1.0</Badge>
                        <span className="text-xs text-gray-500">上传 · 张三 · 2024-01-15</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onSwitchVersion(versions[0])}>切换查看</Button>
                    </div>
                  </div>
                  <div className="relative pl-4">
                    <div className="absolute left-0 top-2 bottom-2 border-l-2 border-gray-200" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">v1.1</Badge>
                        <span className="text-xs text-gray-500">清洗 · 李四 · 2024-01-16</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onSwitchVersion(versions[1])}>切换查看</Button>
                    </div>
                    <div className="mt-2 ml-6 flex items-center text-xs text-gray-600">
                      <GitBranch className="h-3 w-3 mr-1 text-green-600" /> 分支 feature/clean
                    </div>
                  </div>
                  <div className="relative pl-4">
                    <div className="absolute left-0 top-2 bottom-2 border-l-2 border-gray-200" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">v1.2</Badge>
                        <span className="text-xs text-gray-500">订阅 · 王五 · 2024-01-17</span>
                        <GitMerge className="h-4 w-4 ml-2 text-purple-600" />
                        <span className="text-xs text-gray-500">合并自 main 与 feature/clean</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onSwitchVersion(versions[2])}>切换查看</Button>
                    </div>
                  </div>
                  <div className="relative pl-4">
                    <div className="absolute left-0 top-2 bottom-2 border-l-2 border-gray-200" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="destructive">v1.3</Badge>
                        <span className="text-xs text-gray-500">清洗 · 赵六 · 2024-01-18 · 失败</span>
                      </div>
                      <Button size="sm" variant="outline" disabled>切换查看</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 筛选工具栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜索版本号或创建人..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            {/* 状态与来源筛选保持不变 */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="成功">成功</SelectItem>
                <SelectItem value="失败">失败</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="上传">上传</SelectItem>
                <SelectItem value="订阅">订阅</SelectItem>
                <SelectItem value="清洗">清洗</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 版本列表 */}
      <Card>
        <CardHeader>
          <CardTitle>版本列表 ({filteredVersions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedVersions.length === filteredVersions.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVersions(filteredVersions.map(v => v.id));
                      } else {
                        setSelectedVersions([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort('versionNumber')}
                >
                  版本号 <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead>来源方式</TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort('createTime')}
                >
                  创建时间 <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead>创建人</TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort('size')}
                >
                  数据大小 <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead>状态</TableHead>
                <TableHead>规则摘要</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVersions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedVersions.includes(version.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVersions([...selectedVersions, version.id]);
                        } else {
                          setSelectedVersions(selectedVersions.filter(id => id !== version.id));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{version.versionNumber}</TableCell>
                  <TableCell>{getSourceBadge(version.source)}</TableCell>
                  <TableCell>{version.createTime}</TableCell>
                  <TableCell>{version.creator}</TableCell>
                  <TableCell>{version.size}</TableCell>
                  <TableCell>{getStatusBadge(version.status)}</TableCell>
                  <TableCell>
                    <div className="text-xs text-gray-600 truncate max-w-[220px]">
                      {(version.rules && version.rules.length > 0) ? version.rules.join('、') : '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSwitchVersion(version)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRollback(version)}
                        disabled={version.status === '失败'}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSwitchVersion(version)}
                        disabled={version.status === '失败'}
                      >
                        切换查看
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 版本对比弹窗 */}
      <Dialog open={isCompareDialogOpen} onOpenChange={setIsCompareDialogOpen}>
        <DialogContent className="w-[95vw] min-w-[1000px] max-w-[1800px] max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>版本对比</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            {selectedVersions.slice(0, 2).map((versionId, index) => {
              const version = versions.find(v => v.id === versionId);
              if (!version) return null;
              
              return (
                <div key={versionId} className="space-y-4">
                  <h3 className="font-semibold text-lg">{version.versionNumber}</h3>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">基本信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>来源方式:</span>
                        <span>{version.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>创建时间:</span>
                        <span>{version.createTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>创建人:</span>
                        <span>{version.creator}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">统计信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>字段数:</span>
                        <span className={index === 1 && version.fieldCount !== versions.find(v => v.id === selectedVersions[0])?.fieldCount ? 'text-yellow-600 font-semibold' : ''}>
                          {version.fieldCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>样本数:</span>
                        <span>{version.sampleCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>缺失比例:</span>
                        <span>{version.missingRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>异常比例:</span>
                        <span>{version.anomalyRate}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">处理规则</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {version.rules?.map((rule, ruleIndex) => (
                          <div key={ruleIndex} className="text-sm">{rule}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* 版本回退弹窗 */}
      <Dialog open={isRollbackDialogOpen} onOpenChange={setIsRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>版本回退确认</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>确认要回退到版本 <strong>{rollbackVersion?.versionNumber}</strong> 吗？</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>注意：</strong>回退将新建版本，不会覆盖现有版本。
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsRollbackDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={confirmRollback}>
                确认回退
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 版本详情组件 */}
      {isVersionDetailOpen && selectedVersionForDetail && (
        <VersionDetail
          version={selectedVersionForDetail}
          datasetName={datasetName}
          onBack={() => setIsVersionDetailOpen(false)}
        />
      )}

      {/* 版本对比弹窗（宽度1800px） */}
      {compareVersions && (
        <Dialog open={isVersionCompareOpen} onOpenChange={setIsVersionCompareOpen}>
          <DialogContent className="w-[95vw] min-w-[1000px] max-w-[1800px] max-h-[90vh] overflow-y-auto p-4">
            <VersionCompare
              version1={compareVersions[0]}
              version2={compareVersions[1]}
              datasetName={datasetName}
              onBack={() => setIsVersionCompareOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default VersionHistory;