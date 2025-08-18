import { ConfigService } from '../ConfigService';
import { DIContainer } from '../../infrastructure/DIContainer';
import { MockFileSystemService } from '../filesystem';

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockFileSystem: MockFileSystemService;
  let container: DIContainer;

  beforeEach(() => {
    // テスト用DIContainerを作成
    container = DIContainer.createTestContainer();
    configService = container.getConfigService();
    mockFileSystem = container.getMockFileSystemService();

    // MockFileSystemServiceをクリア
    mockFileSystem.clear();
  });

  describe('getSavePathList', () => {
    it('正常なpahcer_config.tomlからsave_path_listを取得する', async () => {
      const mockTomlContent = `
[[pahcer-studio]]
save_path_list = ["main.cpp", "modules"]
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(true);
      expect(result.paths).toEqual(['main.cpp', 'modules']);
    });

    it('空のsave_path_listが設定されている場合', async () => {
      const mockTomlContent = `
[[pahcer-studio]]
save_path_list = []
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(true);
      expect(result.paths).toEqual([]);
    });

    it('pahcer-studioセクションが存在しない場合', async () => {
      const mockTomlContent = `
[general]
version = "0.2.0"

[problem]
problem_name = "AHC050"
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(false);
      expect(result.paths).toEqual([]);
    });

    it('save_path_listプロパティが存在しない場合', async () => {
      const mockTomlContent = `
[[pahcer-studio]]
other_property = "value"
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(false);
      expect(result.paths).toEqual([]);
    });

    it('pahcer_config.tomlが存在しない場合', async () => {
      // ファイルを追加しない（存在しない状態）

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(false);
      expect(result.paths).toEqual([]);
    });

    it('不正なTOMLファイルの場合', async () => {
      mockFileSystem.addFile('/mock/pahcer_config.toml', 'invalid toml content [[[', { size: 23 });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(false);
      expect(result.paths).toEqual([]);
    });

    it('複数のpahcer-studioセクションがある場合は最初のものを使用', async () => {
      const mockTomlContent = `
[[pahcer-studio]]
save_path_list = ["first.cpp"]

[[pahcer-studio]]
save_path_list = ["second.cpp"]
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const result = await configService.getSavePathList();

      expect(result.isConfigured).toBe(true);
      expect(result.paths).toEqual(['first.cpp']);
    });
  });

  describe('getConfig', () => {
    it('基本的な設定を読み取れる', async () => {
      const mockTomlContent = `
[general]
version = "0.2.0"

[problem]
problem_name = "AHC050"
objective = "Max"

[[pahcer-studio]]
save_path_list = ["main.cpp"]
`;
      mockFileSystem.addFile('/mock/pahcer_config.toml', mockTomlContent, {
        size: mockTomlContent.length,
      });

      const config = await configService.getConfig();

      expect(config.general?.version).toBe('0.2.0');
      expect(config.problem?.problem_name).toBe('AHC050');
      expect(config.problem?.objective).toBe('Max');
      expect(config['pahcer-studio']?.[0]?.save_path_list).toEqual(['main.cpp']);
    });

    it('ファイルが存在しない場合は空オブジェクトを返す', async () => {
      // ファイルを追加しない（存在しない状態）

      const config = await configService.getConfig();

      expect(config).toEqual({});
    });
  });
});
