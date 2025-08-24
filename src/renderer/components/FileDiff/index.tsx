import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Alert } from '@mui/material';
import { Allotment } from 'allotment';
import type { DiffResult } from '../../../services/DiffCalculationService';
import type { TestExecution } from '../../../schemas/execution';
import VersionSelector from './VersionSelector';
import FileList from './FileList';
import MonacoDiffViewer from './MonacoDiffViewer';

const FileDiff: React.FC = () => {
  // State management
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [selectedExecutions, setSelectedExecutions] = useState<string[]>([]);
  const [useLatest, setUseLatest] = useState(false);

  const handleUseLatestChange = (value: boolean) => {
    setUseLatest(value);
    // useLatest切り替え時に選択をリセット
    setSelectedExecutions([]);
    setDiffResult(null);
  };
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Load executions on component mount
  useEffect(() => {
    loadExecutions();
  }, []);

  const loadExecutions = async () => {
    setExecutionsLoading(true);
    try {
      const result = await window.electronAPI.execution.getAll();
      setExecutions(result);
      setError('');
    } catch (err) {
      setError(`実行一覧の取得に失敗しました: ${err}`);
    } finally {
      setExecutionsLoading(false);
    }
  };

  const handleCompare = async () => {
    if (useLatest && selectedExecutions.length !== 1) {
      setError('比較するバージョンを1つ選択してください');
      return;
    }
    
    if (!useLatest && selectedExecutions.length !== 2) {
      setError('比較するバージョンを2つ選択してください');
      return;
    }

    setDiffLoading(true);
    setError('');
    try {
      let result: DiffResult;
      if (useLatest) {
        result = await window.electronAPI.diff.getDiffWithLatest(selectedExecutions[0]);
      } else {
        // 2つの実行比較（バックエンドで自動的に時刻順判別）
        result = await window.electronAPI.diff.getDiff(selectedExecutions[0], selectedExecutions[1]);
      }
      setDiffResult(result);

      // Select the first changed file if available
      if (result.changedFiles.length > 0) {
        setSelectedFilePath(result.changedFiles[0].path);
      }
    } catch (err) {
      setError(`差分の取得に失敗しました: ${err}`);
      setDiffResult(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const selectedFile = diffResult?.changedFiles.find((file) => file.path === selectedFilePath);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          ファイル差分比較
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <Allotment defaultSizes={[35, 65]} vertical={false}>
          {/* Left Pane: Version Selection */}
          <Allotment.Pane minSize={350} maxSize={600}>
            <Paper sx={{ height: '100%', p: 1.5 }}>
              <VersionSelector
                executions={executions}
                executionsLoading={executionsLoading}
                selectedExecutions={selectedExecutions}
                useLatest={useLatest}
                onExecutionsChange={setSelectedExecutions}
                onUseLatestChange={handleUseLatestChange}
                onCompare={handleCompare}
                onRefresh={loadExecutions}
                comparing={diffLoading}
              />
            </Paper>
          </Allotment.Pane>

          {/* Right Pane: File Diff Display */}
          <Allotment.Pane>
            {diffResult ? (
              <Allotment defaultSizes={[25, 75]} vertical={false}>
                {/* File List - Left Bottom */}
                <Allotment.Pane minSize={200} maxSize={350}>
                  <FileList
                    diffResult={diffResult}
                    selectedFilePath={selectedFilePath}
                    onFileSelect={setSelectedFilePath}
                  />
                </Allotment.Pane>

                {/* Diff Viewer - Right */}
                <Allotment.Pane>
                  {selectedFile ? (
                    <MonacoDiffViewer file={selectedFile} />
                  ) : (
                    <Paper
                      sx={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#1e1e1e',
                      }}
                    >
                      <Typography color="textSecondary">ファイルを選択してください</Typography>
                    </Paper>
                  )}
                </Allotment.Pane>
              </Allotment>
            ) : (
              <Paper
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f5f5f5',
                }}
              >
                <Typography variant="h6" color="textSecondary">
                  バージョンを選択して比較を実行してください
                </Typography>
              </Paper>
            )}
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  );
};

export default FileDiff;
