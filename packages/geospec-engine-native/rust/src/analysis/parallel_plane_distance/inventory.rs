//! Source inventory reuses the Part21 lexer, independently of F2 admission.

use super::*;
use crate::backend::pmi::*;

pub(crate) const MAX_SOURCE_BYTES: usize = 8 * 1024 * 1024;
const MAX_INVENTORY_RECORDS: usize = 131_072;

fn unavailable<T>(status: PmiFieldStatus, reason: &str) -> PmiField<T> {
    PmiField::unavailable(status, reason)
}

fn token(graph: &Graph<'_>, node: &Node) -> String {
    match node {
        Node::Ref(id) => format!("#{id}"),
        Node::Str(span) | Node::Enum(span) | Node::Number(span) => {
            String::from_utf8_lossy(&graph.source[span.start..span.end]).into_owned()
        }
        Node::List(values) => format!(
            "({})",
            values
                .iter()
                .map(|value| token(graph, value))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Node::Typed(name, values) => format!(
            "{name}({})",
            values
                .iter()
                .map(|value| token(graph, value))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Node::Omitted => "$".into(),
        Node::Derived => "*".into(),
    }
}

fn raw(graph: &Graph<'_>, id: u32) -> Vec<PmiRawEntity> {
    graph.records.get(&id).map_or_else(Vec::new, |record| {
        record
            .components
            .iter()
            .map(|entity| PmiRawEntity {
                source_id: id,
                kind: entity.name.clone(),
                arguments: entity.args.iter().map(|node| token(graph, node)).collect(),
            })
            .collect()
    })
}

fn component<'a>(record: &'a Record, name: &str) -> Option<&'a Entity> {
    record.components.iter().find(|entity| entity.name == name)
}

fn invalid(message: impl Into<String>) -> F2Error {
    F2Error::InvalidInput(message.into())
}

// Read header entities with the same lexer as DATA, so names inside comments
// and quoted strings cannot become declarations. This is not schema validation.
fn header_file_schema(source: &[u8]) -> Result<SourceSpan, F2Error> {
    let mut items = 0;
    let mut cursor = Cursor::new(
        source,
        SourceSpan {
            start: 0,
            end: source.len(),
        },
        &mut items,
    );
    let result = (|| {
        cursor.ws()?;
        for byte in b"ISO-10303-21;" {
            cursor.byte(*byte)?;
        }
        cursor.ws()?;
        if cursor.ident()? != "HEADER" {
            return Err(invalid("Missing HEADER section."));
        }
        cursor.ws()?;
        cursor.byte(b';')?;
        let mut schema = None;
        loop {
            cursor.ws()?;
            let start = cursor.pos;
            if cursor.ident()? == "ENDSEC" {
                cursor.ws()?;
                cursor.byte(b';')?;
                break;
            }
            cursor.pos = start;
            let entity = cursor.entity()?;
            cursor.ws()?;
            cursor.byte(b';')?;
            if cursor.pos - start > MAX_RECORD {
                return Err(limit("HEADER declaration exceeds64KiB."));
            }
            if entity.name == "FILE_SCHEMA" {
                if schema.is_some() {
                    return Err(invalid("Duplicate HEADER FILE_SCHEMA declarations."));
                }
                let [Node::List(names)] = entity.args.as_slice() else {
                    return Err(invalid("Malformed FILE_SCHEMA declaration."));
                };
                if names.is_empty() || names.iter().any(|name| !matches!(name, Node::Str(_))) {
                    return Err(invalid("FILE_SCHEMA requires a nonempty list of strings."));
                }
                schema = Some(SourceSpan {
                    start,
                    end: cursor.pos,
                });
            }
        }
        let schema = schema.ok_or_else(|| invalid("Missing HEADER FILE_SCHEMA declaration."))?;
        cursor.ws()?;
        let data_start = cursor.pos;
        if cursor.ident()? != "DATA" {
            return Err(invalid("HEADER is not followed by DATA."));
        }
        cursor.ws()?;
        if cursor.peek() == Some(b'(') {
            // Consume syntactically framed parameters under the existing lexer
            // limits, but do not interpret or admit a new DATA-section profile.
            cursor.pos = data_start;
            cursor.entity()?;
            cursor.ws()?;
            cursor.byte(b';')?;
            if cursor.pos - data_start > MAX_RECORD {
                return Err(limit("DATA introducer exceeds64KiB."));
            }
            return Err(F2Error::UnsupportedDomain(
                "Parameterized DATA sections are outside the PMI inventory profile.".into(),
            ));
        }
        cursor.byte(b';')?;
        Ok(schema)
    })();
    result.map_err(|error| match error {
        F2Error::ResourceLimit(_) | F2Error::InvalidInput(_) | F2Error::UnsupportedDomain(_) => {
            error
        }
        _ => invalid(format!("Malformed HEADER: {error}")),
    })
}

fn unique_component<'a>(record: &'a Record, name: &str) -> Result<&'a Entity, F2Error> {
    let mut matches = record
        .components
        .iter()
        .filter(|entity| entity.name == name);
    let value = matches
        .next()
        .ok_or_else(|| invalid(format!("Missing {name} component.")))?;
    if matches.next().is_some() {
        return Err(invalid(format!("Duplicate {name} components.")));
    }
    Ok(value)
}

fn measure(graph: &Graph<'_>, id: u32) -> Result<(SourceSpan, u32, String), F2Error> {
    let record = graph.record(id)?;
    let entity = component(record, "MEASURE_WITH_UNIT")
        .or_else(|| {
            component(record, "LENGTH_MEASURE_WITH_UNIT").filter(|entity| !entity.args.is_empty())
        })
        .ok_or_else(|| unsupported("No scalar length measure is present."))?;
    if entity.args.len() != 2 {
        return Err(unsupported("Length measure arity is invalid."));
    }
    let Node::Typed(kind, values) = &entity.args[0] else {
        return Err(unsupported("Measure is not a typed length."));
    };
    if !matches!(kind.as_str(), "LENGTH_MEASURE" | "POSITIVE_LENGTH_MEASURE") || values.len() != 1 {
        return Err(unsupported("Only scalar length measures are supported."));
    }
    let Node::Number(span) = values[0] else {
        return Err(unsupported("Measure has no authored decimal."));
    };
    let name = component(record, "REPRESENTATION_ITEM")
        .and_then(|entity| entity.args.first())
        .and_then(|node| graph.string(node).ok())
        .unwrap_or_default();
    Ok((span, graph.reference(&entity.args[1])?, name))
}

fn unit(
    graph: &mut Graph<'_>,
    id: u32,
    path: &mut Vec<u32>,
) -> Result<(BigRational, Vec<PmiRawEntity>), F2Error> {
    if path.contains(&id) {
        return Err(invalid("Unit chain is cyclic."));
    }
    if path.len() >= 16 {
        return Err(limit("Unit chain exceeds16 links."));
    }
    path.push(id);
    let record = graph.record(id)?.clone();
    let length = unique_component(&record, "LENGTH_UNIT")?;
    if !length.args.is_empty() {
        return Err(invalid("Malformed LENGTH_UNIT marker."));
    }
    let named = unique_component(&record, "NAMED_UNIT")?;
    if named.args.len() != 1 {
        return Err(invalid("Malformed NAMED_UNIT dimensions."));
    }
    let mut records = raw(graph, id);
    let scale = if component(&record, "CONVERSION_BASED_UNIT").is_some() {
        let conversion = unique_component(&record, "CONVERSION_BASED_UNIT")?;
        if conversion.args.len() != 2 {
            return Err(invalid("Malformed conversion-based unit."));
        }
        if !matches!(conversion.args.first(), Some(Node::Str(_)))
            || component(&record, "SI_UNIT").is_some()
        {
            return Err(invalid(
                "Malformed or competing conversion unit definition.",
            ));
        }
        let Node::Ref(exponents) = named.args[0] else {
            return Err(invalid(
                "Conversion NAMED_UNIT must reference dimensional exponents.",
            ));
        };
        let dimensions = graph
            .records
            .get(&exponents)
            .ok_or_else(|| invalid("Missing dimensional exponents record."))?;
        let entity = unique_component(dimensions, "DIMENSIONAL_EXPONENTS")?.clone();
        if dimensions.components.len() != 1 || entity.args.len() != 7 {
            return Err(invalid("Malformed length dimension exponents."));
        }
        for (index, node) in entity.args.iter().enumerate() {
            let Node::Number(span) = node else {
                return Err(invalid("Non-numeric dimension exponent."));
            };
            let value = graph.decimal(*span, &BigRational::one())?.millimeters;
            if value != BigRational::from_integer((if index == 0 { 1 } else { 0 }).into()) {
                return Err(invalid("Conversion unit does not have length dimensions."));
            }
        }
        records.extend(raw(graph, exponents));
        let Node::Ref(factor_id) = conversion.args[1] else {
            return Err(invalid("Conversion factor must be an entity reference."));
        };
        let (span, base_id, _) = measure(graph, factor_id)?;
        let factor = graph.decimal(span, &BigRational::one())?.millimeters;
        if factor <= BigRational::zero() {
            return Err(invalid("Unit conversion factor must be positive."));
        }
        let (base, base_records) = unit(graph, base_id, path)?;
        records.extend(raw(graph, factor_id));
        records.extend(base_records);
        mul(&factor, &base, &mut graph.arithmetic)?
    } else {
        if !matches!(named.args[0], Node::Derived) {
            return Err(invalid("Direct SI dimensions must be derived."));
        }
        graph.unit_scale(id)?
    };
    path.pop();
    Ok((scale, records))
}

fn number_value(graph: &mut Graph<'_>, id: u32) -> Result<PmiNumber, F2Error> {
    let (span, unit_id, name) = measure(graph, id)?;
    let (scale, unit_records) = unit(graph, unit_id, &mut Vec::new())?;
    if unit_records
        .iter()
        .flat_map(|record| &record.arguments)
        .map(String::len)
        .sum::<usize>()
        > 65_536
    {
        return Err(limit("Authored unit record closure exceeds64KiB."));
    }
    let value = graph.decimal(span, &scale)?;
    let normalized = mul(&value.millimeters, &scale, &mut graph.arithmetic)?;
    Ok(PmiNumber {
        source_id: id,
        authored_text: value.spelling,
        unit_id,
        unit_records,
        millimetres: ratio_text(&normalized),
        name,
    })
}

fn ratio_text(value: &BigRational) -> String {
    format!("{}/{}", value.numer(), value.denom())
}

fn read_ratio(text: &str) -> BigRational {
    let (numerator, denominator) = text.split_once('/').expect("internally normalized ratio");
    BigRational::new(
        numerator.parse().expect("internal numerator"),
        denominator.parse().expect("internal denominator"),
    )
}

fn dimensions(
    graph: &mut Graph<'_>,
    id: u32,
) -> Result<(PmiField<Vec<PmiNumber>>, PmiField<PmiLimits>), F2Error> {
    let missing = || {
        unavailable(
            PmiFieldStatus::Missing,
            "No supported authored dimension representation.",
        )
    };
    let mut links: Vec<_> = graph
        .reverse
        .get(&id)
        .into_iter()
        .flatten()
        .copied()
        .filter(|key| {
            graph
                .entity(*key, "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")
                .is_ok()
        })
        .collect();
    links.sort_unstable();
    if links.is_empty() {
        return Ok((
            missing(),
            unavailable(PmiFieldStatus::Missing, "No authored limits."),
        ));
    }
    if links.len() != 1 {
        return Ok((
            unavailable(
                PmiFieldStatus::Ambiguous,
                "Multiple characteristic representations.",
            ),
            unavailable(
                PmiFieldStatus::Ambiguous,
                "Multiple characteristic representations.",
            ),
        ));
    }
    let mut numbers = Vec::new();
    let mut numbers_complete = false;
    let extracted = (|| -> Result<Option<PmiLimits>, F2Error> {
        let link = graph.entity(links[0], "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")?;
        if link.args.len() != 2 {
            return Err(unsupported("Malformed characteristic representation."));
        }
        let representation_id = graph.reference(&link.args[1])?;
        let representation = graph
            .entity(representation_id, "SHAPE_DIMENSION_REPRESENTATION")?
            .clone();
        if representation.args.len() != 3 {
            return Err(unsupported("Malformed dimension representation."));
        }
        let item_ids = graph
            .list(&representation.args[1])?
            .iter()
            .map(|node| graph.reference(node))
            .collect::<Result<Vec<_>, _>>()?;
        for key in item_ids {
            if measure(graph, key).is_ok() {
                if numbers.len() == 8 {
                    return Err(limit("Dimension exceeds eight scalar inventory values."));
                }
                numbers.push(number_value(graph, key)?);
            }
        }
        if numbers.is_empty() {
            return Err(unsupported("No supported scalar length values."));
        }
        numbers_complete = true;
        let lower = numbers
            .iter()
            .filter(|value| value.name == "lower limit")
            .collect::<Vec<_>>();
        let upper = numbers
            .iter()
            .filter(|value| value.name == "upper limit")
            .collect::<Vec<_>>();
        let mut bounds = if lower.len() == 1 && upper.len() == 1 {
            Some((
                read_ratio(&lower[0].millimetres),
                read_ratio(&upper[0].millimetres),
                "authored-limits",
            ))
        } else if !lower.is_empty() || !upper.is_empty() {
            return Err(F2Error::InvalidInput(
                "Missing or ambiguous authored limit item.".into(),
            ));
        } else {
            None
        };
        let tolerances: Vec<_> = graph
            .reverse
            .get(&id)
            .into_iter()
            .flatten()
            .copied()
            .filter(|key| graph.entity(*key, "PLUS_MINUS_TOLERANCE").is_ok())
            .collect();
        if !tolerances.is_empty() {
            if tolerances.len() != 1 || bounds.is_some() || numbers.len() != 1 {
                return Err(F2Error::InvalidInput(
                    "Competing nominal/tolerance/limit representations.".into(),
                ));
            }
            let tolerance = graph.entity(tolerances[0], "PLUS_MINUS_TOLERANCE")?.clone();
            if tolerance.args.len() != 2 {
                return Err(unsupported("Malformed plus/minus tolerance."));
            }
            let value = graph
                .entity(graph.reference(&tolerance.args[0])?, "TOLERANCE_VALUE")?
                .clone();
            if value.args.len() != 2 {
                return Err(unsupported("Malformed tolerance value."));
            }
            let minus = number_value(graph, graph.reference(&value.args[0])?)?;
            let plus = number_value(graph, graph.reference(&value.args[1])?)?;
            let nominal = read_ratio(&numbers[0].millimetres);
            let low = add(
                &nominal,
                &read_ratio(&minus.millimetres),
                &mut graph.arithmetic,
            )?;
            let high = add(
                &nominal,
                &read_ratio(&plus.millimetres),
                &mut graph.arithmetic,
            )?;
            numbers.extend([minus, plus]);
            bounds = Some((low, high, "nominal-plus-minus"));
        }
        let limits = if let Some((low, high, basis)) = bounds {
            if low < BigRational::zero() || high < low {
                return Err(F2Error::InvalidInput(
                    "Dimension limits must satisfy0<=lower<=upper.".into(),
                ));
            }
            Some(PmiLimits {
                lower_millimetres: ratio_text(&low),
                upper_millimetres: ratio_text(&high),
                basis: basis.into(),
            })
        } else {
            None
        };
        Ok(limits)
    })();
    Ok(match extracted {
        Ok(limits) => (
            PmiField::supported(numbers),
            limits
                .map(PmiField::supported)
                .unwrap_or_else(|| unavailable(PmiFieldStatus::Missing, "No authored limits.")),
        ),
        Err(error) => {
            if matches!(error, F2Error::ResourceLimit(_)) {
                return Err(error);
            }
            let status = if matches!(error, F2Error::InvalidInput(_)) {
                PmiFieldStatus::Invalid
            } else {
                PmiFieldStatus::Unsupported
            };
            let values = if numbers_complete {
                PmiField::supported(numbers)
            } else {
                PmiField {
                    status,
                    value: (!numbers.is_empty()).then_some(numbers),
                    reason: Some(error.to_string()),
                }
            };
            (values, PmiField::unavailable(status, error.to_string()))
        }
    })
}

struct OccurrenceParents {
    by_product: HashMap<u32, Vec<u32>>,
    #[cfg(test)]
    indexed_records: usize,
    #[cfg(test)]
    lookups: std::cell::Cell<usize>,
}

impl OccurrenceParents {
    fn new(graph: &Graph<'_>) -> Self {
        let mut by_product: HashMap<u32, Vec<u32>> = HashMap::new();
        #[cfg(test)]
        let mut indexed_records = 0;
        for (&id, record) in &graph.records {
            #[cfg(test)]
            {
                indexed_records += 1;
            }
            if let Some(entity) = component(record, "NEXT_ASSEMBLY_USAGE_OCCURRENCE") {
                if let Some(Node::Ref(product)) = entity.args.get(4) {
                    by_product.entry(*product).or_default().push(id);
                }
            }
        }
        for parents in by_product.values_mut() {
            parents.sort_unstable();
            parents.dedup();
        }
        Self {
            by_product,
            #[cfg(test)]
            indexed_records,
            #[cfg(test)]
            lookups: std::cell::Cell::new(0),
        }
    }

    fn get(&self, product: u32) -> &[u32] {
        #[cfg(test)]
        self.lookups.set(self.lookups.get() + 1);
        self.by_product.get(&product).map_or(&[], Vec::as_slice)
    }
}

fn reference_group(
    graph: &Graph<'_>,
    parents: &OccurrenceParents,
    node: Option<&Node>,
) -> Vec<PmiShapeReference> {
    let Some(node) = node else {
        return vec![PmiShapeReference {
            source_aspect_id: None,
            source_usage_ids: Vec::new(),
            source_item_ids: Vec::new(),
            requested_route: unavailable(
                PmiFieldStatus::Missing,
                "Source endpoint argument is absent.",
            ),
            associations: unavailable(
                PmiFieldStatus::Missing,
                "Source endpoint argument is absent.",
            ),
        }];
    };
    let Ok(aspect_id) = graph.reference(node) else {
        return vec![PmiShapeReference {
            source_aspect_id: None,
            source_usage_ids: Vec::new(),
            source_item_ids: Vec::new(),
            requested_route: unavailable(
                PmiFieldStatus::Invalid,
                "Shape aspect is not a source reference.",
            ),
            associations: unavailable(
                PmiFieldStatus::Invalid,
                "Shape aspect is not a source reference.",
            ),
        }];
    };
    let mut reference = PmiShapeReference {
        source_aspect_id: Some(aspect_id),
        source_usage_ids: Vec::new(),
        source_item_ids: Vec::new(),
        requested_route: unavailable(PmiFieldStatus::Missing, "No explicit occurrence route."),
        associations: unavailable(PmiFieldStatus::Missing, "No qualified source association."),
    };
    if !graph.records.contains_key(&aspect_id) {
        reference.associations =
            unavailable(PmiFieldStatus::Missing, "Source shape aspect is absent.");
        return vec![reference];
    }
    let mut usages: Vec<_> = graph
        .reverse
        .get(&aspect_id)
        .into_iter()
        .flatten()
        .copied()
        .filter(|id| {
            graph.records[id].components.iter().any(|entity| {
                matches!(
                    entity.name.as_str(),
                    "GEOMETRIC_ITEM_SPECIFIC_USAGE" | "ITEM_IDENTIFIED_REPRESENTATION_USAGE"
                )
            })
        })
        .collect();
    usages.sort_unstable();
    for id in usages {
        reference.source_usage_ids.push(id);
        // Empty subtype markers do not compete with their attribute-bearing
        // supertype. Multiple populated definitions are not selected by order.
        let populated = graph.records[&id]
            .components
            .iter()
            .filter(|entity| {
                matches!(
                    entity.name.as_str(),
                    "GEOMETRIC_ITEM_SPECIFIC_USAGE" | "ITEM_IDENTIFIED_REPRESENTATION_USAGE"
                ) && !entity.args.is_empty()
            })
            .collect::<Vec<_>>();
        let entity = match populated.as_slice() {
            [entity] => *entity,
            [] => {
                reference.associations = unavailable(
                    PmiFieldStatus::Invalid,
                    "Usage has no attribute-bearing component.",
                );
                continue;
            }
            _ => {
                reference.associations = unavailable(
                    PmiFieldStatus::Ambiguous,
                    "Usage has competing populated components.",
                );
                continue;
            }
        };
        if entity.args.len() != 5 || graph.reference(&entity.args[2]).ok() != Some(aspect_id) {
            reference.associations = unavailable(
                PmiFieldStatus::Invalid,
                "Malformed source usage attributes.",
            );
            continue;
        }
        collect_refs(&entity.args[4..5], &mut reference.source_item_ids);
    }
    // Preserve authored list order, including repeated source references.
    if let Ok(aspect) = graph.entity(aspect_id, "SHAPE_ASPECT") {
        if let Some(Node::Ref(pds_id)) = aspect.args.get(2) {
            if let Ok(pds) = graph.entity(*pds_id, "PRODUCT_DEFINITION_SHAPE") {
                if let Some(Node::Ref(nauo)) = pds.args.get(2) {
                    if graph
                        .entity(*nauo, "NEXT_ASSEMBLY_USAGE_OCCURRENCE")
                        .is_ok()
                    {
                        reference.requested_route = occurrence_route(graph, parents, *nauo);
                    }
                }
            }
        }
    }
    vec![reference]
}

fn occurrence_route(graph: &Graph<'_>, index: &OccurrenceParents, leaf: u32) -> PmiField<Vec<u32>> {
    let mut route = vec![leaf];
    let mut current = leaf;
    loop {
        let Ok(link) = graph.entity(current, "NEXT_ASSEMBLY_USAGE_OCCURRENCE") else {
            return unavailable(
                PmiFieldStatus::Missing,
                "Occurrence declaration is missing.",
            );
        };
        let Some(Node::Ref(parent_product)) = link.args.get(3) else {
            return unavailable(
                PmiFieldStatus::Invalid,
                "Occurrence has no relating product.",
            );
        };
        let parents = index.get(*parent_product);
        if parents.is_empty() {
            route.reverse();
            return PmiField::supported(route);
        }
        if parents.len() != 1 {
            return unavailable(
                PmiFieldStatus::Ambiguous,
                "Source occurrence has multiple parent routes.",
            );
        }
        if route.contains(&parents[0]) || route.len() >= 32 {
            return unavailable(
                PmiFieldStatus::Invalid,
                "Occurrence route is cyclic or too deep.",
            );
        }
        current = parents[0];
        route.push(current);
    }
}

#[cfg(test)]
pub(crate) fn parse(source: &[u8], maximum_records: usize) -> Result<PmiInventory, F2Error> {
    parse_with_output_limit(source, maximum_records, 1_048_576)
}

struct EncodingLimit {
    remaining: usize,
}
impl std::io::Write for EncodingLimit {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > self.remaining {
            return Err(std::io::Error::other("PMI record output limit"));
        }
        self.remaining -= bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

pub(crate) fn parse_with_output_limit(
    source: &[u8],
    maximum_records: usize,
    output_limit: usize,
) -> Result<PmiInventory, F2Error> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(limit("PMI source exceeds8MiB."));
    }
    let text = std::str::from_utf8(source)
        .map_err(|_| F2Error::InvalidInput("STEP source is not UTF8.".into()))?;
    if !text.trim_start().starts_with("ISO-10303-21;")
        || !text.trim_end().ends_with("END-ISO-10303-21;")
    {
        return Err(F2Error::InvalidInput(
            "Source is not a complete Part21 exchange envelope.".into(),
        ));
    }
    let schema = header_file_schema(source)?;
    let mut graph = Graph::parse_bounded(source, MAX_SOURCE_BYTES, MAX_INVENTORY_RECORDS, 8192)?;
    let parents = OccurrenceParents::new(&graph);
    let mut ids: Vec<_> = graph.records.keys().copied().collect();
    ids.sort_unstable();
    let mut records = Vec::new();
    let mut encoding = EncodingLimit {
        remaining: output_limit,
    };
    for id in ids {
        let record = graph.records[&id].clone();
        let selected = record.components.iter().find_map(|entity| {
            let name = entity.name.as_str();
            let family = if name.starts_with("DIMENSIONAL_LOCATION")
                || name.starts_with("DIMENSIONAL_SIZE")
            {
                "dimension"
            } else if name.starts_with("DATUM") {
                "datum"
            } else if name.ends_with("_TOLERANCE")
                || name.starts_with("GEOMETRIC_TOLERANCE")
                || name.starts_with("TOLERANCE_")
            {
                "tolerance"
            } else if name.starts_with("ANNOTATION_")
                || name == "DRAUGHTING_CALLOUT"
                || name == "DRAUGHTING_MODEL"
            {
                "presentation"
            } else {
                return None;
            };
            Some((entity.clone(), family))
        });
        let Some((entity, family)) = selected else {
            continue;
        };
        if records.len() == maximum_records {
            return Err(limit("PMI inventory exceeds requested record limit."));
        }
        let dimension = family == "dimension";
        let location = entity.name == "DIMENSIONAL_LOCATION";
        let size = entity.name == "DIMENSIONAL_SIZE";
        let first = if location {
            reference_group(&graph, &parents, entity.args.get(2))
        } else if size {
            reference_group(&graph, &parents, entity.args.first())
        } else {
            Vec::new()
        };
        let second = if location {
            reference_group(&graph, &parents, entity.args.get(3))
        } else {
            Vec::new()
        };
        let (numbers, limits) = if dimension {
            dimensions(&mut graph, id)?
        } else {
            (
                unavailable(
                    PmiFieldStatus::Unsupported,
                    "Raw inventory only for this family.",
                ),
                unavailable(
                    PmiFieldStatus::Unsupported,
                    "No geometric tolerance interpretation.",
                ),
            )
        };
        let name = entity
            .args
            .get(if size { 1 } else { 0 })
            .and_then(|node| graph.string(node).ok())
            .map(PmiField::supported)
            .unwrap_or_else(|| unavailable(PmiFieldStatus::Missing, "No authored name."));
        let mut raw_records = Vec::new();
        let mut raw_ids = HashSet::new();
        let mut append_raw = |id| {
            if raw_ids.insert(id) {
                raw_records.extend(raw(&graph, id));
            }
        };
        append_raw(id);
        if dimension {
            // Preserve dimension notes/modifiers and representation links as raw
            // source data, without interpreting their GD&T meaning.
            let mut related: Vec<u32> = graph
                .reverse
                .get(&id)
                .into_iter()
                .flatten()
                .copied()
                .filter(|key| {
                    graph
                        .entity(*key, "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")
                        .is_ok()
                        || graph.entity(*key, "PLUS_MINUS_TOLERANCE").is_ok()
                })
                .collect();
            related.sort_unstable();
            for link_id in related {
                append_raw(link_id);
                if let Ok(link) = graph.entity(link_id, "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")
                {
                    if let Some(Node::Ref(representation)) = link.args.get(1) {
                        append_raw(*representation);
                        if let Ok(entity) =
                            graph.entity(*representation, "SHAPE_DIMENSION_REPRESENTATION")
                        {
                            if let Some(Node::List(items)) = entity.args.get(1) {
                                for item in items {
                                    if let Node::Ref(item) = item {
                                        append_raw(*item);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            for reference in first.iter().chain(&second) {
                if let Some(aspect) = reference.source_aspect_id {
                    append_raw(aspect);
                }
                for usage in &reference.source_usage_ids {
                    append_raw(*usage);
                }
            }
        }
        let record = PmiRecord {
            source_id: id,
            family: family.into(),
            channel: if family == "presentation" {
                "presentation"
            } else {
                "semantic"
            }
            .into(),
            kind: entity.name,
            name,
            first,
            second,
            numbers,
            limits,
            interpretation: unavailable(
                PmiFieldStatus::Unsupported,
                "Inventory is not geometric conformance or schema validation.",
            ),
            raw: raw_records,
        };
        serde_json::to_writer(&mut encoding, &record)
            .map_err(|_| limit("PMI record content exceeds output limit."))?;
        records.push(record);
    }
    let status = if records.iter().any(|record| record.channel == "semantic") {
        "semantic"
    } else if !records.is_empty() {
        "graphical-only"
    } else {
        "empty"
    };
    Ok(PmiInventory {
        contract: "geospec.pmi.inventory/v1",
        status: status.into(),
        file_schema: text[schema.start..schema.end].into(),
        file_schema_span: [schema.start, schema.end],
        edition_validation: "not-validated",
        records,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exchange(body: &str) -> String {
        format!("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AP242'));\nENDSEC;\nDATA;\n{body}\nENDSEC;\nEND-ISO-10303-21;")
    }

    fn scalar_source(unit_record: &str, items: &str, values: &str) -> String {
        exchange(&format!("#1=DIMENSIONAL_LOCATION('d','',$,$);\n#2=DIMENSIONAL_CHARACTERISTIC_REPRESENTATION(#1,#3);\n#3=SHAPE_DIMENSION_REPRESENTATION('',({items}),#99);\n{values}\n#40=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));\n#41=MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#40);\n{unit_record}"))
    }

    #[test]
    fn pmi_inventory_review_header_uses_real_declaration() {
        let source = exchange("").replacen("HEADER;", "/* FILE_SCHEMA(('DECOY')); */\nHEADER;", 1);
        assert_eq!(
            parse(source.as_bytes(), 1024).unwrap().file_schema,
            "FILE_SCHEMA(('AP242'));"
        );
    }

    #[test]
    fn pmi_inventory_review_rejects_malformed_conversion_dimensions() {
        let source = scalar_source(
            "#42=(CONVERSION_BASED_UNIT('bad',#41)LENGTH_UNIT()NAMED_UNIT($));",
            "#20",
            "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#42);",
        );
        let value = parse(source.as_bytes(), 1024).unwrap();
        assert_eq!(value.records[0].numbers.status, PmiFieldStatus::Invalid);
    }

    #[test]
    fn pmi_inventory_review_ninth_scalar_is_hard_refusal() {
        let items = (20..29)
            .map(|id| format!("#{id}"))
            .collect::<Vec<_>>()
            .join(",");
        let values = (20..29)
            .map(|id| {
                format!(
                    "#{id}=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE({}.),#40);",
                    id - 19
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let source = scalar_source("", &items, &values);
        assert!(matches!(
            parse(source.as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
    }

    #[test]
    fn pmi_inventory_review_inherited_usage_reads_populated_component() {
        let source = exchange("#1=DIMENSIONAL_LOCATION('d','',#10,$);\n#10=SHAPE_ASPECT('','',$,.T.);\n#11=(GEOMETRIC_ITEM_SPECIFIC_USAGE()ITEM_IDENTIFIED_REPRESENTATION_USAGE('','',#10,#99,(#50))); ");
        let value = parse(source.as_bytes(), 1024).unwrap();
        assert_eq!(value.records[0].first[0].source_usage_ids, [11]);
        assert_eq!(value.records[0].first[0].source_item_ids, [50]);
    }

    #[test]
    fn pmi_parser_correction_review_probe_requires_data_delimiter() {
        let source =
            exchange("#1=DIMENSIONAL_LOCATION('d','',$,$);").replace("DATA;", "DATA BROKEN;");
        let result = parse(source.as_bytes(), 1024);
        assert!(
            matches!(&result, Err(F2Error::InvalidInput(_))),
            "{result:?}"
        );
    }

    #[test]
    fn pmi_parser_correction_review_probe_classifies_malformed_conversion_factor_as_invalid() {
        let source = scalar_source(
            "#42=(CONVERSION_BASED_UNIT('bad',$)LENGTH_UNIT()NAMED_UNIT(#43));\n#43=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);",
            "#20",
            "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#42);",
        );
        let value = parse(source.as_bytes(), 1024).unwrap();
        assert_eq!(value.records[0].numbers.status, PmiFieldStatus::Invalid);
    }

    #[test]
    fn pmi_inventory_header_scope_shape_and_span() {
        let schema = "FILE_SCHEMA /* preserved */ (( 'AP242' ));";
        let source = exchange("").replace("FILE_SCHEMA(('AP242'));", &format!("/* FILE_SCHEMA(('COMMENT')); */\nFILE_NAME('FILE_SCHEMA((''STRING''));',());\n{schema}"));
        let value = parse(source.as_bytes(), 1024).unwrap();
        assert_eq!(value.file_schema, schema);
        assert_eq!(
            &source[value.file_schema_span[0]..value.file_schema_span[1]],
            schema
        );
        assert!(serde_json::to_value(value)
            .unwrap()
            .get("file_schema_span")
            .is_none());
        for replacement in [
            "",
            "FILE_SCHEMA(('A'));FILE_SCHEMA(('B'));",
            "FILE_SCHEMA(());",
            "FILE_SCHEMA('AP242');",
            "FILE_SCHEMA((#1));",
        ] {
            let bad = exchange("#1=OTHER();").replace("FILE_SCHEMA(('AP242'));", replacement);
            assert!(
                matches!(parse(bad.as_bytes(), 1024), Err(F2Error::InvalidInput(_))),
                "{replacement}"
            );
        }
        let outside = exchange("#1=OTHER('FILE_SCHEMA((''DATA''));');")
            .replace("FILE_SCHEMA(('AP242'));", "/* FILE_SCHEMA(('COMMENT')); */");
        assert!(matches!(
            parse(outside.as_bytes(), 1024),
            Err(F2Error::InvalidInput(_))
        ));
        assert!(parse(exchange("").replace("HEADER;", "").as_bytes(), 1024).is_err());
        assert!(parse(
            exchange("")
                .replace("ENDSEC;\nDATA;", "HEADER;\nDATA;")
                .as_bytes(),
            1024
        )
        .is_err());
    }

    #[test]
    fn pmi_inventory_data_introducer_valid_invalid_and_unsupported() {
        let original = exchange("#1=DIMENSIONAL_LOCATION('d','',$,$);");
        for introducer in ["DATA;", "DATA /* delimiter comment */ ;"] {
            let result = parse(original.replace("DATA;", introducer).as_bytes(), 1024).unwrap();
            assert_eq!(result.records[0].source_id, 1);
        }
        for introducer in [
            "DATA BROKEN;",
            "DATA",
            "DATA,;",
            "DATA_BROKEN;",
            "DATA('section',('AP242')) BROKEN;",
            "DATA('section',('AP242');",
        ] {
            assert!(
                matches!(
                    parse(original.replace("DATA;", introducer).as_bytes(), 1024),
                    Err(F2Error::InvalidInput(_))
                ),
                "{introducer}"
            );
        }
        assert!(matches!(
            parse(
                original
                    .replace("DATA;", "DATA('section',('AP242'));")
                    .as_bytes(),
                1024
            ),
            Err(F2Error::UnsupportedDomain(_))
        ));
        let oversized = format!("DATA('{}',('AP242'));", "x".repeat(MAX_RECORD));
        assert!(matches!(
            parse(original.replace("DATA;", &oversized).as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
    }

    #[test]
    fn pmi_inventory_conversion_factor_token_classification_preserves_profile() {
        let unit = |factor: &str| {
            format!("#42=(CONVERSION_BASED_UNIT('unit',{factor})LENGTH_UNIT()NAMED_UNIT(#43));#43=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);")
        };
        let source = |factor: &str| {
            scalar_source(
                &unit(factor),
                "#20",
                "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#42);",
            )
        };
        for factor in ["$", "*", "'factor'", ".T.", "1.", "(#41)"] {
            let result = parse(source(factor).as_bytes(), 1024).unwrap();
            assert_eq!(
                result.records[0].numbers.status,
                PmiFieldStatus::Invalid,
                "{factor}"
            );
            assert!(result.records[0].numbers.value.is_none());
        }
        let result = parse(source("#41").as_bytes(), 1024).unwrap();
        assert_eq!(result.records[0].numbers.status, PmiFieldStatus::Supported);
        assert_eq!(
            result.records[0].numbers.value.as_ref().unwrap()[0].millimetres,
            "127/5"
        );
        let unsupported =
            source("#41").replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT(.MICRO.,.METRE.)");
        let result = parse(unsupported.as_bytes(), 1024).unwrap();
        assert_eq!(
            result.records[0].numbers.status,
            PmiFieldStatus::Unsupported
        );
        assert!(result.records[0].numbers.value.is_none());
    }

    #[test]
    fn pmi_inventory_unit_structure_and_partial_semantic_values() {
        let valid = "#42=(CONVERSION_BASED_UNIT('inch',#41)LENGTH_UNIT()NAMED_UNIT(#43));\n#43=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);";
        let values = "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#42);";
        let source = scalar_source(valid, "#20", values);
        assert_eq!(
            parse(source.as_bytes(), 1024).unwrap().records[0]
                .numbers
                .value
                .as_ref()
                .unwrap()[0]
                .millimetres,
            "127/5"
        );
        for bad in [
            valid.replace("NAMED_UNIT(#43)", "NAMED_UNIT(#43,#43)"),
            valid.replace("NAMED_UNIT(#43)", "NAMED_UNIT(#43)NAMED_UNIT(#43)"),
            valid.replace("NAMED_UNIT(#43)", "NAMED_UNIT(*)"),
            valid.replace("NAMED_UNIT(#43)", "NAMED_UNIT(#999)"),
            valid.replace("LENGTH_UNIT()", "LENGTH_UNIT($)"),
            valid.replace("(1.,0.,0.,0.,0.,0.,0.)", "(0.,1.,0.,0.,0.,0.,0.)"),
            valid.replace("(1.,0.,0.,0.,0.,0.,0.)", "(1.,0.,0.,0.,0.,0.)"),
            valid.replace("(1.,0.,0.,0.,0.,0.,0.)", "(1.,0.,0.,0.,0.,0.,$)"),
            valid.replace("DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)", "(DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.))"),
        ] {
            let source = scalar_source(&bad, "#21,#20", &format!("#21=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(2.),#40);\n{values}"));
            let result = parse(source.as_bytes(), 1024).unwrap();
            assert_eq!(result.records[0].numbers.status, PmiFieldStatus::Invalid, "{bad}");
            assert_eq!(result.records[0].numbers.value.as_ref().unwrap().len(), 1);
        }
    }

    #[test]
    fn pmi_inventory_hard_limits_never_return_partial_inventory() {
        let source = scalar_source("", "#20,#21", "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#40);\n#21=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E999999),#40);");
        assert!(matches!(
            parse(source.as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
        let source = scalar_source(
            "",
            "#20",
            "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#40);",
        );
        let mut graph = Graph::parse_bounded(
            source.as_bytes(),
            MAX_SOURCE_BYTES,
            MAX_INVENTORY_RECORDS,
            8192,
        )
        .unwrap();
        graph.work.decimals = MAX_DECIMALS;
        assert!(matches!(
            dimensions(&mut graph, 1),
            Err(F2Error::ResourceLimit(_))
        ));
        let mut graph = Graph::parse_bounded(
            source.as_bytes(),
            MAX_SOURCE_BYTES,
            MAX_INVENTORY_RECORDS,
            8192,
        )
        .unwrap();
        graph.arithmetic.operations = MAX_RATIONAL_OPS;
        assert!(matches!(
            dimensions(&mut graph, 1),
            Err(F2Error::ResourceLimit(_))
        ));
        let units = (100..117).map(|id| format!("#{id}=(CONVERSION_BASED_UNIT('u',#{})LENGTH_UNIT()NAMED_UNIT(#43));#{}=MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#{});", id+100, id+100, if id==116 {40} else {id+1})).collect::<String>();
        let chain = scalar_source(
            &format!("#43=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);{units}"),
            "#20",
            "#20=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#100);",
        );
        assert!(matches!(
            parse(chain.as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
        assert!(matches!(
            parse_with_output_limit(source.as_bytes(), 1024, 1),
            Err(F2Error::ResourceLimit(_))
        ));
        let header = exchange("").replace(
            "FILE_SCHEMA(('AP242'));",
            &format!(
                "FILE_NAME('{}');FILE_SCHEMA(('AP242'));",
                "x".repeat(MAX_RECORD)
            ),
        );
        assert!(matches!(
            parse(header.as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
        let header = exchange("").replace(
            "FILE_SCHEMA(('AP242'));",
            &format!("FILE_SCHEMA(({}));", vec!["'A'"; MAX_LIST + 1].join(",")),
        );
        assert!(matches!(
            parse(header.as_bytes(), 1024),
            Err(F2Error::ResourceLimit(_))
        ));
    }

    #[test]
    fn pmi_inventory_competing_usage_is_not_selected_by_order() {
        let populated = "ITEM_IDENTIFIED_REPRESENTATION_USAGE('','',#10,#99,(#50))";
        let other = "GEOMETRIC_ITEM_SPECIFIC_USAGE('','',#10,#99,(#51))";
        for components in [
            format!("GEOMETRIC_ITEM_SPECIFIC_USAGE(){populated}"),
            format!("{populated}GEOMETRIC_ITEM_SPECIFIC_USAGE()"),
        ] {
            let source = exchange(&format!("#1=DIMENSIONAL_LOCATION('d','',#10,$);#10=SHAPE_ASPECT('','',$,.T.);#11=({components});"));
            assert_eq!(
                parse(source.as_bytes(), 1024).unwrap().records[0].first[0].source_item_ids,
                [50]
            );
        }
        for components in [
            format!("{populated}{other}"),
            format!("{other}{populated}"),
            format!("{populated}{populated}"),
        ] {
            let source = exchange(&format!("#1=DIMENSIONAL_LOCATION('d','',#10,$);#10=SHAPE_ASPECT('','',$,.T.);#11=({components});"));
            let result = parse(source.as_bytes(), 1024).unwrap();
            let reference = &result.records[0].first[0];
            assert_eq!(reference.associations.status, PmiFieldStatus::Ambiguous);
            assert_eq!(reference.source_usage_ids, [11]);
            assert!(reference.source_item_ids.is_empty());
        }
    }

    #[test]
    fn pmi_inventory_occurrence_index_has_one_scan_and_depth_bounded_lookups() {
        let route = "#1=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#100,#101,'');\n#2=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#101,#102,'');\n#3=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#102,#103,'');";
        for unrelated in [0, 4096] {
            let extra = (0..unrelated)
                .map(|i| format!("#{}=OTHER();\n", i + 1000))
                .collect::<String>();
            let source = exchange(&format!("{route}\n{extra}"));
            let graph = Graph::parse_bounded(
                source.as_bytes(),
                MAX_SOURCE_BYTES,
                MAX_INVENTORY_RECORDS,
                8192,
            )
            .unwrap();
            let index = OccurrenceParents::new(&graph);
            for _ in 0..2048 {
                assert_eq!(
                    occurrence_route(&graph, &index, 3).value,
                    Some(vec![1, 2, 3])
                );
            }
            assert_eq!(index.indexed_records, unrelated + 3);
            assert_eq!(index.lookups.get(), 2048 * 3);
        }
        for (extra, status) in [
            (
                "#4=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#999,#102,'');",
                PmiFieldStatus::Ambiguous,
            ),
            (
                "#4=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#103,#100,'');",
                PmiFieldStatus::Invalid,
            ),
        ] {
            for body in [format!("{route}{extra}"), format!("{extra}{route}")] {
                let source = exchange(&body);
                let graph = Graph::parse_bounded(
                    source.as_bytes(),
                    MAX_SOURCE_BYTES,
                    MAX_INVENTORY_RECORDS,
                    8192,
                )
                .unwrap();
                let index = OccurrenceParents::new(&graph);
                assert_eq!(occurrence_route(&graph, &index, 3).status, status);
                assert_eq!(
                    occurrence_route(&graph, &index, 9999).status,
                    PmiFieldStatus::Missing
                );
            }
        }
        let body = (1..=33)
            .map(|i| {
                format!(
                    "#{i}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('','','',#{},#{},'');",
                    i + 99,
                    i + 100
                )
            })
            .collect::<String>();
        let source = exchange(&body);
        let graph = Graph::parse_bounded(
            source.as_bytes(),
            MAX_SOURCE_BYTES,
            MAX_INVENTORY_RECORDS,
            8192,
        )
        .unwrap();
        let index = OccurrenceParents::new(&graph);
        assert_eq!(
            occurrence_route(&graph, &index, 33).status,
            PmiFieldStatus::Invalid
        );
        assert_eq!(index.lookups.get(), 32);
    }
    const SOURCE: &[u8] = include_bytes!(
        "../../../../native/occt/rust/tests/fixtures/parallel-plane-distance-source.step"
    );
    const SAME: &[u8] = include_bytes!("../../../../native/occt/rust/tests/fixtures/parallel-plane-distance-same-occurrence-source.step");
    const EMPTY: &[u8] =
        include_bytes!("../../../../native/occt/rust/tests/fixtures/ap242-box.step");
    const NIST: &[u8] = include_bytes!(
        "../../../../../geospec-engine/fixtures/interop/nist-pmi/nist_ctc_05_asme1_ap242-e1.stp"
    );
    const GRAPHICAL: &[u8] = include_bytes!(
        "../../../../../geospec-engine/fixtures/interop/nist-pmi/nist_ctc_01_asme1_ap203.stp"
    );

    #[test]
    fn pmi_inventory_preserves_original_tau_units_limits_and_ordered_roles() {
        for (source, routes) in [
            (SOURCE, [vec![600], vec![620]]),
            (SAME, [vec![600], vec![600]]),
        ] {
            let inventory = parse(source, 1024).unwrap();
            assert_eq!(inventory.status, "semantic");
            let declaration = inventory
                .records
                .iter()
                .find(|record| record.source_id == 710)
                .unwrap();
            assert_eq!(declaration.first[0].source_aspect_id, Some(700));
            assert_eq!(declaration.second[0].source_aspect_id, Some(702));
            assert_eq!(
                declaration.first[0].requested_route.value,
                Some(routes[0].clone())
            );
            assert_eq!(
                declaration.second[0].requested_route.value,
                Some(routes[1].clone())
            );
            let numbers = declaration.numbers.value.as_ref().unwrap();
            assert_eq!(
                numbers
                    .iter()
                    .map(|number| number.authored_text.as_str())
                    .collect::<Vec<_>>(),
                ["0.95", "1.05"]
            );
            assert_eq!(numbers[0].unit_id, 405);
            assert_eq!(numbers[0].millimetres, "19/2");
            assert_eq!(numbers[1].millimetres, "21/2");
            let limits = declaration.limits.value.as_ref().unwrap();
            assert_eq!(limits.lower_millimetres, "19/2");
            assert_eq!(limits.upper_millimetres, "21/2");
        }
    }

    #[test]
    fn pmi_inventory_preserves_nist_authored_inches_and_signed_tolerance() {
        let inventory = parse(NIST, 1024).unwrap();
        let declaration = inventory
            .records
            .iter()
            .find(|record| record.source_id == 941)
            .unwrap();
        assert_eq!(declaration.first[0].source_aspect_id, Some(1005));
        assert_eq!(declaration.second[0].source_aspect_id, Some(1004));
        let numbers = declaration
            .numbers
            .value
            .as_ref()
            .expect("source-authored length values");
        assert_eq!(
            numbers
                .iter()
                .map(|number| number.authored_text.as_str())
                .collect::<Vec<_>>(),
            ["5.", "-0.008", "0.008"]
        );
        assert_eq!(numbers[0].unit_id, 13402);
        assert_eq!(numbers[0].millimetres, "127/1");
        assert_eq!(numbers[1].millimetres, "-127/625");
        let limits = declaration.limits.value.as_ref().unwrap();
        assert_eq!(limits.lower_millimetres, "79248/625");
        assert_eq!(limits.upper_millimetres, "79502/625");
        assert!(inventory
            .records
            .iter()
            .any(|record| record.family == "datum"
                && record.interpretation.status == PmiFieldStatus::Unsupported
                && !record.raw.is_empty()));
        assert!(inventory
            .records
            .iter()
            .any(|record| record.family == "tolerance" && !record.raw.is_empty()));
    }

    #[test]
    fn pmi_inventory_invalid_missing_ambiguous_and_partial_fields() {
        let original = std::str::from_utf8(SOURCE).unwrap();
        let declaration = |source: &str| {
            parse(source.as_bytes(), 1024)
                .unwrap()
                .records
                .into_iter()
                .find(|record| record.source_id == 710)
                .unwrap()
        };
        let invalid = declaration(&original.replace("$,#700,#702)", "$,$,#702)"));
        assert_eq!(invalid.first[0].source_aspect_id, None);
        assert_eq!(
            invalid.first[0].associations.status,
            PmiFieldStatus::Invalid
        );
        let missing = declaration(&original.replace("$,#700,#702)", "$,#999999,#702)"));
        assert_eq!(missing.first[0].source_aspect_id, Some(999999));
        assert_eq!(
            missing.first[0].associations.status,
            PmiFieldStatus::Missing
        );
        let ambiguous = declaration(&original.replace("#700=SHAPE_ASPECT", "#9000=NEXT_ASSEMBLY_USAGE_OCCURRENCE('a','','',#9010,#502,'');\n#9001=NEXT_ASSEMBLY_USAGE_OCCURRENCE('b','','',#9011,#502,'');\n#700=SHAPE_ASPECT"));
        assert_eq!(
            ambiguous.first[0].requested_route.status,
            PmiFieldStatus::Ambiguous
        );
        let invalid_limits =
            declaration(&original.replace("LENGTH_MEASURE(0.95)", "LENGTH_MEASURE(1.95)"));
        assert_eq!(invalid_limits.limits.status, PmiFieldStatus::Invalid);
        assert_eq!(invalid_limits.numbers.status, PmiFieldStatus::Supported);
        assert_eq!(invalid_limits.numbers.value.unwrap()[0].millimetres, "39/2");
    }

    #[test]
    fn pmi_inventory_distinguishes_empty_graphical_failed_and_limits() {
        assert_eq!(parse(EMPTY, 1024).unwrap().status, "empty");
        assert_eq!(parse(GRAPHICAL, 1024).unwrap().status, "graphical-only");
        assert!(parse(&SOURCE[..SOURCE.len() - 30], 1024).is_err());
        assert!(parse(NIST, 1).is_err());
        assert_eq!(
            serde_json::to_vec(&parse(SOURCE, 1024).unwrap()).unwrap(),
            serde_json::to_vec(&parse(SOURCE, 1024).unwrap()).unwrap()
        );
    }
}
