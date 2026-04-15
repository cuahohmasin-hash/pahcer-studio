#pragma GCC optimize("O3,unroll-loops")
#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <algorithm>
#include <queue>
#include <cstdint> // ★ CE対策: int8_t等の型に必須
#include <cstring>  // ★ memcpy用

using namespace std;
using namespace std::chrono;

const double TIME_LIMIT_TOTAL = 1.95;
const int STATE_POOL_SIZE = 1000000;

// steady_clock を使用して正確な時間を計測
double get_time(steady_clock::time_point start_time) {
    auto now = steady_clock::now();
    return duration_cast<milliseconds>(now - start_time).count() / 1000.0;
}

const int dr[] = {-1, 1, 0, 0};
const int dc[] = {0, 0, -1, 1};
const string DIR = "UDLR";

struct State {
    int8_t grid[256];
    uint8_t snake[256];
    int8_t colors[256];
    int16_t snake_len;
    int16_t colors_len;
    int32_t turns; 
    int parent_id;
    char last_move;
    int16_t error_count;
    int16_t first_error_idx; // ★ 追加（-1 = エラーなし）
    long long eval_score;

    void advance(int d, int N, const vector<int>& target_d) {
        int hr = snake[0] / N, hc = snake[0] % N;
        int nr = hr + dr[d], nc = hc + dc[d], np = nr * N + nc;
        bool eat = (grid[np] > 0);
        int copy_len = eat ? snake_len : snake_len - 1;
        for (int i = copy_len; i > 0; --i) snake[i] = snake[i - 1];
        snake[0] = np; snake_len = copy_len + 1;
        
        // 噛みちぎり判定: しっぽ(snake_len-1)は含まない
        int hit_idx = -1;
        for (int i = 1; i < snake_len - 1; ++i) {
            if (snake[i] == snake[0]) { hit_idx = i; break; }
        }
        
        if (hit_idx != -1) {
            for (int p = hit_idx + 1; p < snake_len; ++p) grid[snake[p]] = colors[p];
            snake_len = hit_idx + 1; colors_len = hit_idx + 1;
            // 噛みちぎり後は短くなるので再スキャン（hit_idx 以下しか走らない）
            error_count = 0;
            first_error_idx = -1; // ★
            for(int i = 0; i < colors_len; ++i) {
                if(colors[i] != target_d[i]) {
                    error_count++;
                    if(first_error_idx == -1) first_error_idx = i; // ★
                }
            }
        } else if (eat) {
            int eaten = grid[np]; colors[colors_len] = eaten;
            if (eaten != target_d[colors_len]) {
                error_count++;
                if(first_error_idx == -1) first_error_idx = colors_len; // ★ 末尾追加なので先頭エラーは変わらない
            }
            colors_len++; grid[np] = 0;
        }
    }
};

State state_pool[STATE_POOL_SIZE];
int pool_ptr = 0;
int alloc_state() { return (pool_ptr < STATE_POOL_SIZE) ? pool_ptr++ : -1; }

string reconstruct_ans(int final_id) {
    if (final_id == -1) return "";
    string res = ""; int curr = final_id;
    while (curr != -1 && state_pool[curr].parent_id != -1) {
        res += state_pool[curr].last_move;
        curr = state_pool[curr].parent_id;
    }
    reverse(res.begin(), res.end());
    return res;
}

// =====================================================
// ★ グローバル変数
// =====================================================
string global_best_ans = ""; 
long long global_best_score = 4e18; 

long long best_eval_at[256][205]; 
int visited_run_id[256][205];
int visited_count[256][205];
int current_run = 0;

int bfs_dist[256];
int bfs_visited_id[256] = {0};
int is_tgt_id[256] = {0};
int is_body_id[256] = {0};
int current_bfs_id = 0;
int my_q[256];
// =====================================================
// ★ グローバル変数エリアに追加
// =====================================================
// main.cpp に適用する値
int G_BEAM_WIDTH = 75;
int G_BEAM_KEEP = 33;
int G_CHOKUDAI_CLONES_lit = 1;
int G_CHOKUDAI_CLONES_lar = 1;
double G_BFS_RATIO_B = 0.60;
double G_BFS_RATIO_C = 0.11;
long long G_WALL_BONUS_B = 34LL;
long long G_WALL_BONUS_C_lit = 22LL;
long long G_WALL_BONUS_C_lar = 0LL;
using PQElement = pair<long long, int>; 
priority_queue<PQElement, vector<PQElement>, greater<PQElement>> chokudai_pq[205];

const long long NEXT_TARGET_WEIGHT = 293LL, NEXT_MISS_PENALTY = 4668LL;

// =====================================================
// 🟢 Beam Search
// =====================================================
void solve_beam(int N, int M, int C, const vector<int>& d, steady_clock::time_point start_time, State init_state, double time_limit) {
    long long H_DIST_WEIGHT = 100LL;
    long long SPACE_W_MIN = 5LL, SPACE_W_MAX = 50LL;
    long long TAIL_P_MIN = 1000LL, TAIL_P_MAX = 8000LL;
    long long MISS_P_MIN = 5000LL, MISS_P_MAX = 8000LL;
    long long COIL_BONUS_WEIGHT = 30LL;
    const double inv_M = 1.0 / M;
    
    int max_game_turns = 99990; 
    int current_total_width = G_BEAM_WIDTH;
    int time_check_cnt = 0; // ★ ループの外で宣言

    while (get_time(start_time) < time_limit) {
        pool_ptr = 0; current_run++;
        long long run_best_score = 4e18;
        int run_best_id = -1;

        vector<int> curr_beam;
        int init_id = alloc_state(); state_pool[init_id] = init_state;
        curr_beam.push_back(init_id);

        for (int t = 0; t < max_game_turns; ++t) {
            if (curr_beam.empty()) goto END_BEAM_RUN;
            
            vector<int> next_beam_by_len[205]; 
            for (int st_id : curr_beam) {
                // ★ 16回に1回、安全に時間チェック
                if (((++time_check_cnt) & 15) == 0) {
                    if (get_time(start_time) > time_limit) goto END_BEAM_RUN;
                }
                
                State& state = state_pool[st_id];
                if (state.colors_len >= M) continue;
                int hr = state.snake[0] / N, hc = state.snake[0] % N;
                for (int dir = 0; dir < 4; ++dir) {
                    
                    int nr = hr + dr[dir], nc = hc + dc[dir];
                    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
                    int np = nr * N + nc;
                    if (np == state.snake[1]) continue;

                    int nxt_id = alloc_state(); if (nxt_id == -1) goto END_BEAM_RUN;
                    State& ns = state_pool[nxt_id];
                    memcpy(ns.grid,   state.grid,   N * N);                      // 256→N*N バイト
                    memcpy(ns.snake,  state.snake,  state.snake_len + 1);        // 256→実長+1 バイト
                    memcpy(ns.colors, state.colors, state.colors_len);           // 256→実長 バイト
                    ns.snake_len     = state.snake_len;
                    ns.colors_len    = state.colors_len;
                    ns.turns         = state.turns;
                    ns.parent_id     = state.parent_id;
                    ns.last_move     = state.last_move;
                    ns.error_count   = state.error_count;
                    ns.first_error_idx = state.first_error_idx;
                    ns.advance(dir, N, d); 
                    ns.turns = state.turns + 1; 
                    ns.parent_id = st_id; ns.last_move = DIR[dir];

                    if (ns.turns > 99990) { pool_ptr--; continue; }

                    long long h_penalty = 0;
                    if (ns.colors_len < M) {
                        int current_req_c = d[ns.colors_len]; 
                        current_bfs_id++;
                        for(int i=0; i<N*N; ++i) if(ns.grid[i] == current_req_c) is_tgt_id[i] = current_bfs_id;
                        for(int i = 1; i < ns.snake_len; ++i) {
                            // 尻尾(snake_len - 1)は次のターンに動いて空きマスになるので、壁にはしない
                            if (i != ns.snake_len - 1) {
                                is_body_id[ns.snake[i]] = current_bfs_id;
                            }
                            // 噛みちぎりのターゲット判定は、尻尾まで含めて正しく行う
                            if(i >= 2 && ns.colors[i] == current_req_c) {
                                is_tgt_id[ns.snake[i-1]] = current_bfs_id;
                            }
                        }

                        int qh = 0, qt = 0; int head = ns.snake[0];
                        my_q[qt++] = head; bfs_dist[head] = 0; bfs_visited_id[head] = current_bfs_id;
                        int found_target_dist = -1; int tail_pos = ns.snake[ns.snake_len - 1];
                        int exit_threshold = max(30, (int)(((N * N) - ns.snake_len) * G_BFS_RATIO_B));
                        while(qh < qt) {
                            int cur = my_q[qh++];
                            if (found_target_dist == -1 && is_tgt_id[cur] == current_bfs_id) found_target_dist = bfs_dist[cur];
                            // BFS内

                            if (found_target_dist != -1 && qt >= exit_threshold) {
                                break; 
                            }
                            int cr = cur / N, cc = cur % N;
                            for(int d2=0; d2<4; ++d2) {
                                if(cr+dr[d2]>=0 && cr+dr[d2]<N && cc+dc[d2]>=0 && cc+dc[d2]<N) {
                                    int p2 = (cr+dr[d2])*N + (cc+dc[d2]);
                                    if(bfs_visited_id[p2] != current_bfs_id && (is_body_id[p2] != current_bfs_id || is_tgt_id[p2] == current_bfs_id)) {
                                        bfs_dist[p2] = bfs_dist[cur] + 1; bfs_visited_id[p2] = current_bfs_id; my_q[qt++] = p2;
                                    }
                                }
                            }
                        }

                        double progress = (double)ns.colors_len * inv_M;
                        long long space_w = SPACE_W_MIN + (long long)((SPACE_W_MAX - SPACE_W_MIN) * progress);
                        long long tail_p  = TAIL_P_MIN + (long long)((TAIL_P_MAX - TAIL_P_MIN) * progress);

                        if (found_target_dist != -1) {
                            h_penalty += (long long)found_target_dist * H_DIST_WEIGHT;
                            if (ns.colors_len + 1 < M) {
                                int next_req_c = d[ns.colors_len + 1]; int next_target_dist = -1;
                                for (int i = 0; i < qt; ++i) {
                                    if (ns.grid[my_q[i]] == next_req_c) { next_target_dist = bfs_dist[my_q[i]]; break; }
                                }
                                for(int i=2; i<ns.snake_len; ++i) {
                                    if (ns.colors[i] == next_req_c && bfs_visited_id[ns.snake[i-1]] == current_bfs_id) {
                                        if (next_target_dist == -1 || bfs_dist[ns.snake[i-1]] < next_target_dist) next_target_dist = bfs_dist[ns.snake[i-1]];
                                    }
                                }
                                if (next_target_dist != -1) h_penalty += (long long)next_target_dist * NEXT_TARGET_WEIGHT;
                                else h_penalty += NEXT_MISS_PENALTY;
                            }
                        } else {
                            long long miss_p  = MISS_P_MIN + (long long)((MISS_P_MAX - MISS_P_MIN) * progress);
                            h_penalty += miss_p; h_penalty -= (long long)qt * space_w;
                        }
                        if (bfs_visited_id[tail_pos] != current_bfs_id) h_penalty += tail_p;

                        int adj_obstacles = 0;
                        for (int d2 = 0; d2 < 4; ++d2) {
                            int nr2 = nr + dr[d2], nc2 = nc + dc[d2];
                            if (nr2 < 0 || nr2 >= N || nc2 < 0 || nc2 >= N) adj_obstacles++;
                            else { int p2 = nr2 * N + nc2; if (is_body_id[p2] == current_bfs_id && is_tgt_id[p2] != current_bfs_id) adj_obstacles++; }
                        }
                        h_penalty -= (long long)adj_obstacles * COIL_BONUS_WEIGHT;
                        // ★ 壁際ボーナス（littleはスピードも意識して係数5）
                        int dist_edge = min({nr, N - 1 - nr, nc, N - 1 - nc});
                        h_penalty += dist_edge * G_WALL_BONUS_B;
                        // =====================================================
                        // ★ 改善案：「エラーの深さ」による重み付け
                        // =====================================================
                        if (ns.error_count > 0 && ns.first_error_idx != -1) {
                            int depth_from_tail = ns.colors_len - 1 - ns.first_error_idx;
                            if (depth_from_tail > 3) {
                                h_penalty += (long long)(depth_from_tail - 3) * 4275LL;
                            }
                        }
                        // =====================================================
                    }

                    ns.eval_score = ns.turns + 13839LL * ns.error_count + h_penalty;
                    long long abs_score = ns.turns + 10000LL * ns.error_count + 20000LL * (M - ns.colors_len);
                    if (abs_score < run_best_score) {
                        run_best_score = abs_score; run_best_id = nxt_id;
                    }

                    int head_p = ns.snake[0]; int c_len = ns.colors_len;
                    if (visited_run_id[head_p][c_len] != current_run) {
                        visited_run_id[head_p][c_len] = current_run;
                        best_eval_at[head_p][c_len] = 4e18;
                    }
                    if (ns.eval_score >= best_eval_at[head_p][c_len]) { pool_ptr--; continue; }
                    best_eval_at[head_p][c_len] = ns.eval_score;
                    
                    next_beam_by_len[c_len].push_back(nxt_id);
                }
            }
            curr_beam.clear();
            for (int l = 0; l <= M; ++l) {
                if (next_beam_by_len[l].empty()) continue;
                sort(next_beam_by_len[l].begin(), next_beam_by_len[l].end(), [](int a, int b) { return state_pool[a].eval_score < state_pool[b].eval_score; });
                int keep_count = min((int)next_beam_by_len[l].size(), G_BEAM_KEEP); 
                for (int i = 0; i < keep_count; ++i) curr_beam.push_back(next_beam_by_len[l][i]);
            }
            if ((int)curr_beam.size() > current_total_width) {
                nth_element(curr_beam.begin(), curr_beam.begin() + current_total_width, curr_beam.end(), [](int a, int b) { return state_pool[a].eval_score < state_pool[b].eval_score; });
                curr_beam.resize(current_total_width);
            }
        }
END_BEAM_RUN:;
        if (run_best_score < global_best_score && run_best_id != -1) {
            global_best_score = run_best_score;
            global_best_ans = reconstruct_ans(run_best_id);
        }
        current_total_width += G_BEAM_KEEP; 
    }
}

// =====================================================
// 🔴 Chokudai Search
// =====================================================
void solve_chokudai(int N, int M, int C, const vector<int>& d, steady_clock::time_point start_time, State init_state, double time_limit,
                    long long H_DIST_WEIGHT, long long SPACE_W_MAX, long long TAIL_P_MAX, long long COIL_BONUS_WEIGHT, int MAX_CLONES,long long WALL_BONUS) {
    long long SPACE_W_MIN = 5LL;
    long long MISS_P_MIN = 5000LL, MISS_P_MAX = 8000LL;
    long long TAIL_P_MIN = 1000LL;
    int restarts = 0;
    int time_check_cnt = 0; // ★ ループの外で宣言
    const double inv_M = 1.0 / M;

    while (get_time(start_time) < time_limit) {
        restarts++; pool_ptr = 0; current_run++;
        for(int i=0; i<=M; ++i) chokudai_pq[i] = priority_queue<PQElement, vector<PQElement>, greater<PQElement>>();        
        long long current_dist_weight = H_DIST_WEIGHT;
        long long current_coil_weight = COIL_BONUS_WEIGHT;
        if (restarts > 1) {
            current_dist_weight += (rand() % 41) - 20;
            current_coil_weight += (rand() % 21) - 10;
            if (current_dist_weight < 10) current_dist_weight = 10;
            if (current_coil_weight < 0) current_coil_weight = 0;
        }

        long long run_best_score = 4e18;
        int run_best_id = -1;

        int init_id = alloc_state(); state_pool[init_id] = init_state;
        chokudai_pq[5].push({0LL, init_id});
        double elapsed_ratio = 0.0;
        while (true) {
            bool expanded_any = false;
            

            // ★ 修正案1：探索窓（Window）は「残り時間」だけで絞る
            if (((++time_check_cnt) & 15) == 0) {
                elapsed_ratio = get_time(start_time) / TIME_LIMIT_TOTAL;
                if (elapsed_ratio > time_limit / TIME_LIMIT_TOTAL) goto END_CHOKUDAI_RUN; // 既存チェックと統合
            }
            int current_max_c = 5;
            for (int c = M - 1; c >= 5; --c) {
                if (!chokudai_pq[c].empty()) { current_max_c = c; break; }
            }

            // 序盤・中盤はすべての層を対象にする（過去のミスを修正可能にする）
            int window_size = M; 
            if (elapsed_ratio > 0.85) window_size = 40; 
            if (elapsed_ratio > 0.95) window_size = 15;
            if (current_max_c < 30) window_size = M; // ガード

            int start_c = max(5, current_max_c - window_size);
            for (int c = start_c; c < M; ++c) { // ★ 5から開始で微速化
                if (chokudai_pq[c].empty()) continue;
                
                // ★ 16回に1回、安全に時間チェック
                if (((++time_check_cnt) & 15) == 0) {
                    if (get_time(start_time) > time_limit) goto END_CHOKUDAI_RUN;
                }

                int st_id = chokudai_pq[c].top().second; chokudai_pq[c].pop(); expanded_any = true;
                State& state = state_pool[st_id];
                int hr = state.snake[0] / N, hc = state.snake[0] % N;
                for (int dir = 0; dir < 4; ++dir) {
                    
                    int nr = hr + dr[dir], nc = hc + dc[dir];
                    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
                    int np = nr * N + nc;
                    if (np == state.snake[1]) continue;

                    int nxt_id = alloc_state(); if (nxt_id == -1) goto END_CHOKUDAI_RUN;
                    State& ns = state_pool[nxt_id];
                    memcpy(ns.grid,   state.grid,   N * N);                      // 256→N*N バイト
                    memcpy(ns.snake,  state.snake,  state.snake_len + 1);        // 256→実長+1 バイト
                    memcpy(ns.colors, state.colors, state.colors_len);           // 256→実長 バイト
                    ns.snake_len     = state.snake_len;
                    ns.colors_len    = state.colors_len;
                    ns.turns         = state.turns;
                    ns.parent_id     = state.parent_id;
                    ns.last_move     = state.last_move;
                    ns.error_count   = state.error_count;
                    ns.first_error_idx = state.first_error_idx;
                    ns.advance(dir, N, d); 
                    ns.turns = state.turns + 1; 
                    ns.parent_id = st_id; ns.last_move = DIR[dir];

                    if (ns.turns > 99990) { pool_ptr--; continue; }

                    long long h_penalty = 0;
                    if (ns.colors_len < M) {
                        int current_req_c = d[ns.colors_len]; 
                        current_bfs_id++;
                        for(int i=0; i<N*N; ++i) if(ns.grid[i] == current_req_c) is_tgt_id[i] = current_bfs_id;
                        for(int i = 1; i < ns.snake_len; ++i) {
                            // 尻尾(snake_len - 1)は次のターンに動いて空きマスになるので、壁にはしない
                            if (i != ns.snake_len - 1) {
                                is_body_id[ns.snake[i]] = current_bfs_id;
                            }
                            // 噛みちぎりのターゲット判定は、尻尾まで含めて正しく行う
                            if(i >= 2 && ns.colors[i] == current_req_c) {
                                is_tgt_id[ns.snake[i-1]] = current_bfs_id;
                            }
                        }

                        int qh = 0, qt = 0; int head = ns.snake[0];
                        my_q[qt++] = head; bfs_dist[head] = 0; bfs_visited_id[head] = current_bfs_id;
                        int found_target_dist = -1; int tail_pos = ns.snake[ns.snake_len - 1];
                        int exit_threshold = max(30, (int)(((N * N) - ns.snake_len) * G_BFS_RATIO_C)); 
                        while(qh < qt) {
                            int cur = my_q[qh++];
                            if (found_target_dist == -1 && is_tgt_id[cur] == current_bfs_id) found_target_dist = bfs_dist[cur];
                            // BFS内
                            // 残り空間の 40% 程度が見つかれば、そのルートは「連結性が高い」と判断して良い
                            

                            if (found_target_dist != -1 && qt >= exit_threshold) {
                                break; 
                            }
                            int cr = cur / N, cc = cur % N;
                            for(int d2=0; d2<4; ++d2) {
                                if(cr+dr[d2]>=0 && cr+dr[d2]<N && cc+dc[d2]>=0 && cc+dc[d2]<N) {
                                    int p2 = (cr+dr[d2])*N + (cc+dc[d2]);
                                    if(bfs_visited_id[p2] != current_bfs_id && (is_body_id[p2] != current_bfs_id || is_tgt_id[p2] == current_bfs_id)) {
                                        bfs_dist[p2] = bfs_dist[cur] + 1; bfs_visited_id[p2] = current_bfs_id; my_q[qt++] = p2;
                                    }
                                }
                            }
                        }

                        double progress = (double)ns.colors_len * inv_M;
                        long long space_w = SPACE_W_MIN + (long long)((SPACE_W_MAX - SPACE_W_MIN) * progress);
                        long long tail_p  = TAIL_P_MIN + (long long)((TAIL_P_MAX - TAIL_P_MIN) * progress);
                        
                        if (found_target_dist != -1) {
                            h_penalty += (long long)found_target_dist * current_dist_weight;
                            if (ns.colors_len + 1 < M) {
                                int next_req_c = d[ns.colors_len + 1]; int next_target_dist = -1;
                                for (int i = 0; i < qt; ++i) {
                                    if (ns.grid[my_q[i]] == next_req_c) { next_target_dist = bfs_dist[my_q[i]]; break; }
                                }
                                for(int i=2; i<ns.snake_len; ++i) {
                                    if (ns.colors[i] == next_req_c && bfs_visited_id[ns.snake[i-1]] == current_bfs_id) {
                                        if (next_target_dist == -1 || bfs_dist[ns.snake[i-1]] < next_target_dist) next_target_dist = bfs_dist[ns.snake[i-1]];
                                    }
                                }
                                if (next_target_dist != -1) h_penalty += (long long)next_target_dist * NEXT_TARGET_WEIGHT;
                                else h_penalty += NEXT_MISS_PENALTY;
                            }
                        } else {
                            long long miss_p  = MISS_P_MIN + (long long)((MISS_P_MAX - MISS_P_MIN) * progress);
                            h_penalty += miss_p; h_penalty -= (long long)qt * space_w;
                        }
                        if (bfs_visited_id[tail_pos] != current_bfs_id) h_penalty += tail_p;

                        // adj_obstacles の計算部分（既存のコードを強化）
                        int adj_obstacles = 0;
                        for (int d2 = 0; d2 < 4; ++d2) {
                            int nr2 = nr + dr[d2], nc2 = nc + dc[d2];
                            if (nr2 < 0 || nr2 >= N || nc2 < 0 || nc2 >= N) {
                                adj_obstacles += 2; // ★ 壁（盤面の外）は「体」よりも高いボーナスを与える
                            } else {
                                int p2 = nr2 * N + nc2;
                                if (is_body_id[p2] == current_bfs_id) adj_obstacles++;
                            }
                        }
                        h_penalty -= (long long)adj_obstacles * current_coil_weight;
                        if (restarts > 1) h_penalty += rand() % 5; 
                        // ★ 壁際ボーナス（largeは生存優先で係数10〜15）
                        int dist_edge = min({nr, N - 1 - nr, nc, N - 1 - nc});
                        h_penalty += dist_edge * WALL_BONUS;
                        // =====================================================
                        // ★ 改善案：「エラーの深さ」による重み付け
                        // =====================================================
                        if (ns.error_count > 0 && ns.first_error_idx != -1) {
                            int depth_from_tail = ns.colors_len - 1 - ns.first_error_idx;
                            if (depth_from_tail > 3) {
                                h_penalty += (long long)(depth_from_tail - 3) * 4275LL;
                            }
                        }
                        // =====================================================
                    }

                    ns.eval_score = ns.turns + 13839LL * ns.error_count + h_penalty;
                    long long abs_score = ns.turns + 10000LL * ns.error_count + 20000LL * (M - ns.colors_len);
                    if (abs_score < run_best_score) {
                        run_best_score = abs_score; run_best_id = nxt_id; 
                    }

                    if (ns.colors_len == M) continue; 

                    int head_p = ns.snake[0]; int next_c = ns.colors_len;
                    if (visited_run_id[head_p][next_c] != current_run) {
                        visited_run_id[head_p][next_c] = current_run;
                        visited_count[head_p][next_c] = 0;
                        best_eval_at[head_p][next_c] = 4e18;

                    }int current_max_clones = (elapsed_ratio > 0.9) ? max(2, MAX_CLONES) : MAX_CLONES;
                    if (visited_count[head_p][next_c] >= current_max_clones && ns.eval_score >= best_eval_at[head_p][next_c]) {
                        pool_ptr--; continue; 
                    }
                    visited_count[head_p][next_c]++;
                    if (ns.eval_score < best_eval_at[head_p][next_c]) best_eval_at[head_p][next_c] = ns.eval_score;
                    
                    chokudai_pq[next_c].push({ns.eval_score, nxt_id});
                }
            }
            if (!expanded_any) break; 
        }
END_CHOKUDAI_RUN:;
        if (run_best_score < global_best_score && run_best_id != -1) {
            global_best_score = run_best_score;
            global_best_ans = reconstruct_ans(run_best_id);
        }
    }
}

int main(int argc, char* argv[]) {
    cin.tie(0); ios::sync_with_stdio(0);
    auto start_time = steady_clock::now();
    int N, M, C; if (!(cin >> N >> M >> C)) return 0;
    vector<int> d(M); for (int i = 0; i < M; ++i) cin >> d[i];
    if (argc >= 10) {
        G_BEAM_WIDTH          = atoi(argv[1]);
        G_BEAM_KEEP           = atoi(argv[2]);
        G_CHOKUDAI_CLONES_lit = atoi(argv[3]);
        G_CHOKUDAI_CLONES_lar = atoi(argv[4]);
        G_BFS_RATIO_B         = atof(argv[5]) / 100.0;
        G_BFS_RATIO_C         = atof(argv[6]) / 100.0;
        G_WALL_BONUS_B        = atoll(argv[7]);
        G_WALL_BONUS_C_lit    = atoll(argv[8]);
        G_WALL_BONUS_C_lar    = atoll(argv[9]);
    }
    for(int i=0; i<256; ++i) for(int j=0; j<205; ++j) {
        best_eval_at[i][j] = 4e18; visited_run_id[i][j] = 0;
    }

    State init_state; init_state.snake_len = 5; init_state.colors_len = 5; init_state.turns = 0;
    init_state.parent_id = -1; init_state.last_move = 'X'; init_state.error_count = 0; init_state.first_error_idx = -1; // ★ 追加
    for (int i = 0; i < 256; ++i) init_state.grid[i] = 0;
    for (int i = 0; i < N; ++i) for (int j = 0; j < N; ++j) {
        int val; cin >> val; init_state.grid[i * N + j] = val;
    }
    for (int i = 0; i < 5; ++i) {
        init_state.snake[i] = (4 - i) * N + 0;
        init_state.colors[i] = 1;
        if(init_state.colors[i] != d[i]) {
            init_state.error_count++;
            if(init_state.first_error_idx == -1) init_state.first_error_idx = i; // ★
        }
    }

    global_best_score = 10000LL * init_state.error_count + 20000LL * (M - init_state.colors_len);

    if (N <= 13) {
        solve_beam(N, M, C, d, start_time, init_state, 0.85);
        solve_chokudai(N, M, C, d, start_time, init_state, 1.90, 266LL, 115LL, 8147LL, 26LL, G_CHOKUDAI_CLONES_lit,G_WALL_BONUS_C_lit);
    } else {
        solve_chokudai(N, M, C, d, start_time, init_state, 1.90, 276LL, 70LL, 4236LL, 68LL, G_CHOKUDAI_CLONES_lar,G_WALL_BONUS_C_lar);
    }
    cerr<<"Score = "<<global_best_score<<endl;
    for (char c : global_best_ans) cout << c << "\n";
    return 0;
}