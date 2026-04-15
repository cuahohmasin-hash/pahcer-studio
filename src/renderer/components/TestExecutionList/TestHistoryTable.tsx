import type React from 'react';
import { useState } from 'react';
// 上のインポート群に混ぜる
import CodeIcon from '@mui/icons-material/Code';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  CircularProgress,
  Box,
  TablePagination,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import type { TestExecution, TestExecutionStatus } from '../../../schemas/execution';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';

interface TestHistoryTableProps {
  executions: TestExecution[];
  loading: boolean;
  selectedExecution: TestExecution | null;
  onExecutionSelect: (execution: TestExecution) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
}

const TestHistoryTable: React.FC<TestHistoryTableProps> = ({
  executions,
  loading,
  selectedExecution,
  onExecutionSelect,
  onRefresh,
  onError,
}) => {
  // テーブル内部の状態
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<TestExecution | null>(null);
  const [deleting, setDeleting] = useState(false);
  // --- コード表示用の状態 ---
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [currentCode, setCurrentCode] = useState<string>('');
  // --- デグレチェック用の状態 ---
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [degradedCases, setDegradedCases] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  // テーブルヘッダーの定義
  const columnDefinitions = [
    {
      key: 'id',
      label: 'ID',
      minWidth: 50,
      tooltip: '実行ID',
      icon: <InfoIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'comment',
      label: 'コメント',
      minWidth: 120,
    },
    {
      key: 'startTime',
      label: '開始時間',
      minWidth: 80,
      tooltip: '実行開始時間',
      icon: <TimelapseIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'status',
      label: 'ステータス',
      minWidth: 80,
    },
    {
      key: 'score',
      label: 'スコア',
      minWidth: 80,
      tooltip: '平均スコア (指数表記)',
      icon: <AssessmentIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'relativeScore',
      label: '相対スコア',
      minWidth: 90,
      tooltip: '最高スコアに対する相対スコア (%)',
      icon: <AssessmentIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'logScore',
      label: 'Log₁₀',
      minWidth: 80,
      tooltip: 'Log10(平均スコア)',
      icon: <AssessmentIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'maxTime',
      label: '最大時間',
      minWidth: 80,
      tooltip: '最大実行時間 (ミリ秒)',
      icon: <TimelapseIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'testCount',
      label: 'テスト数',
      minWidth: 80,
      tooltip: '成功数 / 総テスト数',
      icon: <PlaylistAddCheckIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    {
      key: 'code',
      label: 'コード',
      minWidth: 60,
      tooltip: '当時のソースコード',
      icon: <CodeIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    // 👇ここから追加👇
    {
      key: 'details',
      label: '詳細',
      minWidth: 60,
      tooltip: 'デグレ（悪化）ケースの確認',
      icon: <FormatListNumberedIcon fontSize="small" sx={{ opacity: 0.6 }} />,
    },
    // 👆ここまで👆
    {
      key: 'actions',
      label: '操作',
      minWidth: 60,
    },
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDeleteClick = (event: React.MouseEvent, execution: TestExecution) => {
    event.stopPropagation();
    setExecutionToDelete(execution);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!executionToDelete?.id) return;

    setDeleting(true);
    try {
      await window.electronAPI.execution.deleteExecution(executionToDelete.id);
      setDeleteDialogOpen(false);
      setExecutionToDelete(null);
      // 削除成功後にリフレッシュ
      await onRefresh();
    } catch (err) {
      console.error('Error deleting execution:', err);
      onError('テスト実行の削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setExecutionToDelete(null);
  };
  // --- コードを表示する処理 ---
  const handleViewCode = async (event: React.MouseEvent, execution: TestExecution) => {
    event.stopPropagation(); // 行クリックイベントを止める
    try {
      // 📝 変更: パスではなく「実行ID」をそのままメインプロセスに渡す！
      const code = await window.electronAPI.execution.getSourceCode(execution.id);
      setCurrentCode(code);
      setCodeDialogOpen(true);
    } catch (err) {
      onError('この実行時のソースコード（バックアップ）が見つかりません。');
    }
  };
  // --- デグレケースを抽出して表示する処理 ---
  const handleViewDetails = async (event: React.MouseEvent, execution: TestExecution) => {
    event.stopPropagation();
    setDetailsDialogOpen(true);
    setDetailsLoading(true);
    setDegradedCases([]);

    try {
      // ① 今の実行のケース一覧を取得
      const currentCases = await window.electronAPI.execution.getTestCases(execution.id);
      
      // ② 1つ前の実行データを探す
      const globalIndex = executions.findIndex(e => e.id === execution.id);
      const prevExecution = executions[globalIndex + 1];

      let badCases: any[] = [];

      if (prevExecution) {
        // ③ 1つ前の実行のケース一覧も取得
        const prevCases = await window.electronAPI.execution.getTestCases(prevExecution.id);
        
        // ④ 突き合わせて、スコアが10%以上悪化したものを抽出 (AHC063はスコアが小さいほど良い)
        currentCases.forEach((currentCase: any) => {
          const prevCase = prevCases.find((p: any) => p.seed === currentCase.seed);
          if (prevCase && currentCase.score && prevCase.score) {
            // 悪化率の計算: (今のスコア - 前のスコア) / 前のスコア
            const diffRatio = (currentCase.score - prevCase.score) / prevCase.score;
            
            // 10% (0.10) 以上スコアが増加（悪化）していたらリスト入り！
            if (diffRatio >= 0.10) {
              badCases.push({
                seed: currentCase.seed,
                currentScore: currentCase.score,
                prevScore: prevCase.score,
                worsePercent: (diffRatio * 100).toFixed(1)
              });
            }
          }
        });
      }

      setDegradedCases(badCases);
    } catch (err) {
      onError('テストケースの詳細取得に失敗しました');
    } finally {
      setDetailsLoading(false);
    }
  };
  const handleCloseCodeDialog = () => {
    setCodeDialogOpen(false);
    setCurrentCode('');
  };
  const getStatusColor = (status: TestExecutionStatus | undefined) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'RUNNING':
        return 'info';
      case 'FAILED':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status: TestExecutionStatus | undefined) => {
    switch (status) {
      case 'COMPLETED':
        return '完了';
      case 'RUNNING':
        return '実行中';
      case 'FAILED':
        return '失敗';
      case 'IDLE':
        return '待機中';
      default:
        return status || '不明';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  const currentPageData = executions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading) {
    return (
      <Paper
        elevation={2}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          borderRadius: 2,
        }}
      >
        <CircularProgress />
      </Paper>
    );
  }

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          p: 0.5,
          borderBottom: '1px solid rgba(224, 224, 224, 1)',
        }}
      >
        <Tooltip title="更新">
          <IconButton size="small" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <TableContainer sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small" padding="none">
          <TableHead>
            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
              {columnDefinitions.map((column) => (
                <TableCell
                  key={column.key}
                  sx={{
                    fontWeight: 'bold',
                    py: 0.5,
                    px: 1,
                    minWidth: column.minWidth,
                  }}
                >
                  {column.tooltip ? (
                    <Tooltip title={column.tooltip} arrow>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {column.label}
                        {column.icon}
                      </Box>
                    </Tooltip>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {currentPageData.map((execution) => (
              <TableRow
                key={execution.id}
                hover
                sx={{
                  '&:last-child td, &:last-child th': { border: 0 },
                  cursor: 'pointer',
                  backgroundColor:
                    selectedExecution?.id === execution.id ? 'rgba(0, 0, 0, 0.08)' : 'inherit',
                }}
                onClick={() => onExecutionSelect(execution)}
              >
                <TableCell sx={{ fontFamily: 'monospace', py: 0.5, px: 1 }}>
                  {execution.id?.substring(0, 4) || '-'}
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>{execution.comment || '-'}</TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>{formatDate(execution.startTime)}</TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  <Chip
                    label={getStatusLabel(execution.status)}
                    color={getStatusColor(execution.status)}
                    size="small"
                    sx={{ fontWeight: 'medium', height: '20px' }}
                  />
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Box sx={{ fontFamily: 'monospace' }}>
                      {execution.averageScore ? execution.averageScore.toExponential(2) : '-'}
                    </Box>
                    {(() => {
                      // 全履歴の中から今のデータの位置を探し、1つ古いデータ(インデックス+1)を取得
                      const globalIndex = executions.findIndex(e => e.id === execution.id);
                      const prevExecution = executions[globalIndex + 1];

                      if (execution.averageScore && prevExecution?.averageScore) {
                        const diff = execution.averageScore - prevExecution.averageScore;
                        const isImproved = diff < 0; // AHC063はスコアが小さい方が良いので「負」なら改善
                        const absDiff = Math.abs(diff);
                        const percent = (absDiff / prevExecution.averageScore) * 100;

                        if (absDiff === 0) return null; // 変化なしなら何も出さない

                        return (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              color: isImproved ? 'success.main' : 'error.main', // 緑か赤
                              fontWeight: 'bold',
                              mt: 0.5
                            }}
                          >
                            {isImproved ? (
                              <TrendingDownIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            ) : (
                              <TrendingUpIcon sx={{ fontSize: 14, mr: 0.5 }} />
                            )}
                            {isImproved ? '-' : '+'}{percent.toFixed(2)}%
                          </Box>
                        );
                      }
                      return null;
                    })()}
                  </Box>
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  {execution.averageRelativeScore !== undefined &&
                  execution.averageRelativeScore !== null
                    ? `${(execution.averageRelativeScore * 100).toFixed(2)}%`
                    : '-'}
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  {execution.averageScore && execution.averageScore > 0
                    ? Math.log10(execution.averageScore).toFixed(4)
                    : '-'}
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  {execution.maxExecutionTime ? `${execution.maxExecutionTime.toFixed(2)}ms` : '-'}
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  {execution.acceptedCount !== undefined && execution.totalCount !== undefined
                    ? `${execution.acceptedCount}/${execution.totalCount}`
                    : '-'}
                </TableCell>
                {/* コード表示ボタン */}
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  <Tooltip title="コードを表示" disableFocusListener>
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => handleViewCode(e, execution)}
                        color="primary" // 常に青くしておく！
                      >
                        <CodeIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
                {/* 👇ここから追加：デグレチェックボタン👇 */}
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  <Tooltip title="デグレ（悪化）チェック" disableFocusListener>
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => handleViewDetails(e, execution)}
                        color="warning" // 目立つようにオレンジ色に！
                      >
                        <FormatListNumberedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
                {/* 👆ここまで👆 */}
                <TableCell sx={{ py: 0.5, px: 1 }}>
                  <Tooltip title="削除" disableFocusListener>
                    <IconButton
                      size="small"
                      onClick={(e) => handleDeleteClick(e, execution)}
                      color="error"
                      disabled={deleting}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50]}
        component="div"
        count={executions.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="表示件数:"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}-${to} / ${count !== -1 ? count : `${to}以上`}`
        }
        sx={{ py: 0 }}
      />

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">テスト実行の削除</DialogTitle>
        <DialogContent>
          <Typography>
            このテスト実行を削除してもよろしいですか？
            <br />
            ID: {executionToDelete?.id?.substring(0, 4)}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            キャンセル
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting}>
            {deleting ? <CircularProgress size={16} /> : '削除'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Code Viewer Dialog */}
      <Dialog
        open={codeDialogOpen}
        onClose={handleCloseCodeDialog}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>ソースコードの確認</DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: '#1e1e1e', color: '#d4d4d4', p: 0 }}>
          <Box sx={{ p: 2, overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
            {currentCode}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCodeDialog}>閉じる</Button>
          <Button 
            onClick={() => {
              navigator.clipboard.writeText(currentCode);
              // ここに「コピーしました」のトースト通知を出せると完璧です
            }} 
            color="primary"
          >
            コピー
          </Button>
        </DialogActions>
      </Dialog>
      {/* 👇ここから追加：デグレ詳細ダイアログ👇 */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormatListNumberedIcon color="warning" />
          デグレ（10%以上悪化）ケース一覧
        </DialogTitle>
        <DialogContent dividers>
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : degradedCases.length === 0 ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              素晴らしい！前回と比較して、10%以上悪化したケースはありません！✨
            </Alert>
          ) : (
            <>
              <Alert severity="error" sx={{ mb: 2 }}>
                {degradedCases.length} 個のケースでデグレ（10%以上の悪化）が検出されました！
              </Alert>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Seed</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>前回スコア</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>今回スコア</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>悪化率</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {degradedCases.map((c) => (
                      <TableRow key={c.seed} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {String(c.seed).padStart(4, '0')}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{c.prevScore}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{c.currentScore}</TableCell>
                        <TableCell sx={{ color: 'error.main', fontWeight: 'bold' }}>
                          +{c.worsePercent}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)} color="primary">
            閉じる
          </Button>
        </DialogActions>
      </Dialog>
      {/* 👆ここまで👆 */}
    </Paper>
  );
};

export default TestHistoryTable;
