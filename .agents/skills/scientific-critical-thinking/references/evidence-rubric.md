# Engineering evidence rubric

## Per-source assessment

| Dimension               | Strong evidence                                                             | Concern signals                                                           |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Question-method fit     | Method directly tests the stated claim                                      | Proxy task or metric is substituted without justification                 |
| Comparisons             | Current, representative baselines under matched conditions                  | Missing strong baselines, unequal tuning, or incomparable hardware/data   |
| Samples and replication | Multiple representative inputs, seeds, systems, or independent replications | Anecdotal examples, one benchmark, one seed, or unclear sampling          |
| Statistics              | Effect sizes and uncertainty match the claim                                | Only point estimates, selective significance, or assumption violations    |
| Reproducibility         | Inputs, versions, code/configuration, and protocol are available            | Hidden preprocessing, unavailable artifacts, or underspecified setup      |
| Robustness              | Sensitivity, failure modes, and boundary cases are tested                   | Only favorable operating points are shown                                 |
| Claim proportionality   | Conclusion stays within measured conditions                                 | General, causal, or production claims from narrow evidence                |
| Conflicts               | Funding and author incentives are disclosed and contextualized              | Undisclosed commercial interest or evaluation by the system creator alone |

## Concern levels

- **Critical:** invalidates the central inference or makes the evidence unusable for the target decision.
- **Important:** materially weakens confidence but leaves some evidence usable.
- **Minor:** limits scope, clarity, or reproducibility without overturning the main result.

## Confidence

- **High:** multiple independent, reproducible, directly relevant lines of evidence with no critical concern.
- **Moderate:** useful direct evidence with important limitations or limited independent replication.
- **Low:** narrow, indirect, weakly controlled, or poorly reproduced evidence.
- **Very low:** critical design problems, unverifiable claims, or evidence that does not test the question.

Do not average concern labels into a numeric grade. Explain the decisive evidence and uncertainty in prose.
