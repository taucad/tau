/**
 * Three 64 × 48 frames of Annex-B H.264 for the fake RTSP camera: Constrained
 * Baseline SPS, PPS and an 821-byte IDR slice, then two P slices (880 bytes).
 *
 * Generated once with ffmpeg 9.0.1 and libx264, with the encoder's SEI removed:
 *
 * ```text
 * ffmpeg -f lavfi -i testsrc2=size=64x48:rate=30 -frames:v 3 -c:v libx264 \
 *   -profile:v baseline -pix_fmt yuv420p -g 3 -bf 0 \
 *   -bsf:v filter_units=remove_types=6 -f h264 camera.h264
 * ```
 *
 * @internal
 */
export const rtspCameraH264 = Buffer.from(
  [
    'AAAAAWdCwArZBHsBEAAAAwAQAAADA8DxImSAAAAAAWjLg8sgAAABZYiECHxCIqAMCEPwHUgAfZmWZAAFrM0ijQfJ3+wOhDMgKgpM',
    's24t/tyJyKcPt3+wOp0jkyV/0LG40FSP511qwkXnTV6s2PJzfV6h6JKMB+f3yhzTtgtf74EAEEKaBwAWAQAKrJI0EQ8bsdzKOPw4',
    '/+cKFxFDRUC9boBuxZZwLcJCQmY/PzE+VnHxf3RFREeG7U+AooyiQDS0mW9y/+GvzwASbkpw+zv9WrFl501eFXTRqnoB0lMH389r',
    'pWm0g6mqtudtGZojV9adrpqQdUDc4sn86wNTCUGMTOhq/PEthlmww+i3/zhvscb5xdzdkPl946+NI809hx/+8Bj1Zb//fmKgNQJs',
    'rDweAAIA+fctJlm+P/9qszRFGg1N3+gdBCMgGlpMs3y/+DrUwkVRY1exU6Q9lRL/qDqImij7v98oOKi6qNm/3ytTCRVFzV4MytGj',
    'Wr1DdEoOl/9s6S0zaDqCgAFwAIEm4lA64INqYbHvJAQP+ICuY0o2p4S01ILS/99Lxypih0PR7pKCsx0aKo8N57/5+I4iru1C/wFl',
    'GVVAGEXInDUj97cwClq1v+tyLkU4fJ3+DXKbvWKuo5Mlf87TkyaDqgVzQqR/OuKRb8up6JR7cnp6AdJTB9/PbQ5p2wWX++AUEKEA',
    'R2CYdXwWFle8KVOzpt6DlT/9xgPjElG1PVyyho5EhH5qB84UbU61Xk69/cYBTuWwbU4AHwh9hopP/88PEBA0QCCxIcCwDIDw4DgG',
    'QfwEAFoH4DgC0Ph/+Gj/gp+/wwKmgYABR9oe6EhI7nh0juYvHgJCgACBGmBTAQAAgEBgDAL8/i+XDYg8NiOH/6DX2FIPz+DEcQAA',
    '4AD9oe6EghmueHIZrnDDAPhsNCsBW0qr4HjEZBISBQgE4xBnsJIlbHG4+WABCZ96IdHmYqVjsVBAhnuFgIDMcAwDw/8BazKJc8Fr',
    'wgWGNCIA3BBG8xShBDNLYSuYFbL2SMjNdIBMPc/DD/sNcTzwPBmZAcAAzgAgQafBxCPLAe3iLLW+WDaBEsk3d5LIBscAwDw7DfwF',
    'LMVVgsJBoCBAAE2AZ5CRyytyyXcwGgt5FM0yIIZpZAEKZc4AAAABQZo4EuNgAAAAAUGaVAW42A==',
  ].join(''),
  'base64',
);
