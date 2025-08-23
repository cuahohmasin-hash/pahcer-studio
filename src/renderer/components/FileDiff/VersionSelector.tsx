import type React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Radio,
  RadioGroup,
  FormControlLabel,
  Switch,
  Typography,
  Chip,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import type { TestExecution } from '../../../schemas/execution';

interface VersionSelectorProps {
  executions: TestExecution[];
  executionsLoading: boolean;
  selectedVersion1: string;
  selectedVersion2: string;
  useLatest: boolean;
  onVersion1Change: (value: string) => void;
  onVersion2Change: (value: string) => void;
  onUseLatestChange: (value: boolean) => void;
  onCompare: () => void;
  onRefresh: () => void;
  comparing: boolean;
}

const VersionSelector: React.FC<VersionSelectorProps> = ({
  executions,
  executionsLoading,
  selectedVersion1,
  selectedVersion2,
  useLatest,
  onVersion1Change,
  onVersion2Change,
  onUseLatestChange,
  onCompare,
  onRefresh,
  comparing,
}) => {
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatScore = (score?: number | null): string => {
    if (score === null || score === undefined) return '-';
    return score.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'RUNNING':
        return 'warning';
      case 'FAILED':
        return 'error';
      default:
        return 'default';
    }
  };

  const canCompare = selectedVersion1 && (selectedVersion2 || useLatest);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header Controls */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h6">バージョン選択</Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={useLatest}
                onChange={(e) => onUseLatestChange(e.target.checked)}
                disabled={executionsLoading}
              />
            }
            label="現在のファイルと比較"
          />

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={executionsLoading}
            size="small"
          >
            更新
          </Button>

          <Button
            variant="contained"
            startIcon={comparing ? <CircularProgress size={16} /> : <CompareArrowsIcon />}
            onClick={onCompare}
            disabled={!canCompare || comparing || executionsLoading}
          >
            {comparing ? '比較中...' : '比較実行'}
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Version Selection Table */}
      <TableContainer component={Paper} sx={{ flexGrow: 1, height: 0 }}>
        <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1 } }}>
          <TableHead>
            <TableRow
              sx={{
                '& .MuiTableCell-head': {
                  backgroundColor: 'grey.100',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                },
              }}
            >
              <TableCell sx={{ width: 70 }}>ID</TableCell>
              <TableCell sx={{ width: 160 }}>コメント</TableCell>
              <TableCell sx={{ width: 90 }}>日時</TableCell>
              <TableCell align="right" sx={{ width: 65 }}>
                絶対
              </TableCell>
              <TableCell align="right" sx={{ width: 65 }}>
                相対
              </TableCell>
              <TableCell sx={{ width: 70 }}>状態</TableCell>
              <TableCell align="center" sx={{ width: 50 }}>
                元
              </TableCell>
              <TableCell align="center" sx={{ width: 50 }}>
                {useLatest ? '比較' : '先'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {executions.map((execution) => {
              const isSelected1 = selectedVersion1 === execution.id;
              const isSelected2 = selectedVersion2 === execution.id;
              const isAnySelected = isSelected1 || isSelected2;

              return (
                <TableRow
                  key={execution.id}
                  sx={{
                    height: 32,
                    backgroundColor: isAnySelected ? 'primary.50' : 'inherit',
                    '&:hover': {
                      backgroundColor: isAnySelected ? 'primary.100' : 'grey.50',
                    },
                  }}
                >
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                    >
                      {execution.id?.substring(0, 6) || '-'}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ maxWidth: 140, fontSize: '0.75rem' }}
                    >
                      {execution.comment || '-'}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                      {formatDate(execution.startTime)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                      {formatScore(execution.averageScore)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                      {formatScore(execution.averageRelativeScore)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={execution.status.charAt(0)}
                      size="small"
                      color={getStatusColor(execution.status) as any}
                      variant="outlined"
                      sx={{
                        minWidth: 20,
                        height: 16,
                        fontSize: '0.6rem',
                        '& .MuiChip-label': { px: 0.5 },
                      }}
                    />
                  </TableCell>

                  <TableCell align="center" sx={{ p: 0 }}>
                    <Radio
                      checked={isSelected1}
                      onChange={() => onVersion1Change(execution.id || '')}
                      disabled={executionsLoading}
                      size="small"
                      color="primary"
                      sx={{ p: 0.5 }}
                    />
                  </TableCell>

                  <TableCell align="center" sx={{ p: 0 }}>
                    {useLatest ? (
                      <Button
                        variant={isSelected1 ? 'contained' : 'outlined'}
                        size="small"
                        onClick={() => {
                          onVersion1Change(execution.id || '');
                          if (!comparing && execution.id) {
                            onCompare();
                          }
                        }}
                        disabled={executionsLoading || comparing}
                        sx={{
                          minWidth: 36,
                          height: 20,
                          fontSize: '0.6rem',
                          px: 0.5,
                        }}
                      >
                        比較
                      </Button>
                    ) : (
                      <Radio
                        checked={isSelected2}
                        onChange={() => onVersion2Change(execution.id || '')}
                        disabled={executionsLoading || execution.id === selectedVersion1}
                        size="small"
                        color="secondary"
                        sx={{ p: 0.5 }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {executions.length === 0 && !executionsLoading && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
            color: 'text.secondary',
          }}
        >
          <Typography>実行履歴がありません</Typography>
        </Box>
      )}
    </Box>
  );
};

export default VersionSelector;
