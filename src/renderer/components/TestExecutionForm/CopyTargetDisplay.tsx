import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

interface FileInfo {
  path: string;
  isDirectory: boolean;
  size?: number;
}

interface CopyTargetDisplayProps {
  files: FileInfo[];
  isConfigured: boolean;
  loading: boolean;
  totalCount: number;
}

const CopyTargetDisplay: React.FC<CopyTargetDisplayProps> = ({
  files,
  isConfigured,
  loading,
  totalCount,
}) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          コピー対象を読み込み中...
        </Typography>
      </Box>
    );
  }

  if (!isConfigured) {
    return (
      <Alert severity="info" sx={{ mt: 1, mb: 2, py: 1 }}>
        <Typography variant="body2">
          pahcer_config.tomlに[pahcer-studio]セクションのsave_path_listが設定されていません。
          実行時にファイル履歴が保存されません。
        </Typography>
      </Alert>
    );
  }

  if (totalCount === 0) {
    return (
      <Alert severity="warning" sx={{ mt: 1, mb: 2, py: 1 }}>
        <Typography variant="body2">
          save_path_listが空または指定されたファイル/フォルダが存在しません。
          実行時にファイル履歴が保存されません。
        </Typography>
      </Alert>
    );
  }

  const getFileIcon = (file: FileInfo) => {
    if (file.isDirectory) {
      return <FolderIcon sx={{ fontSize: 14, color: 'primary.main' }} />;
    }
    return <InsertDriveFileIcon sx={{ fontSize: 14, color: 'text.secondary' }} />;
  };

  const formatFileSize = (size?: number): string => {
    if (!size) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <Box sx={{ mt: 0.5, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="caption" color="primary" sx={{ fontWeight: 'medium' }}>
          実行時にコピーされるファイル/フォルダ
        </Typography>
        <Chip
          label={`${totalCount}件`}
          size="small"
          variant="outlined"
          color="primary"
          sx={{ height: '18px', fontSize: '0.7rem' }}
        />
      </Box>

      <Paper
        variant="outlined"
        sx={{
          height: '100px', // さらに高さを縮小
          overflow: 'auto',
          backgroundColor: '#fafafa',
        }}
      >
        <List dense sx={{ py: 0 }}>
          {files.map((file, index) => (
            <ListItem key={index} sx={{ py: 0.1, px: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
                {getFileIcon(file)}
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          wordBreak: 'break-all',
                          flex: 1,
                        }}
                      >
                        {file.path}
                      </Typography>
                      {file.size && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontFamily: 'monospace',
                            fontSize: '0.65rem',
                            ml: 1,
                            flexShrink: 0,
                          }}
                        >
                          {formatFileSize(file.size)}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </Box>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default CopyTargetDisplay;