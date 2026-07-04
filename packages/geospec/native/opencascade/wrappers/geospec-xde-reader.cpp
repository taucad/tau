// GeoSpec AP242 STEP-XDE structure reader for custom opencascade.js builds.
//
// Implements SB1 of the GeoSpec verification-kernel blueprint: one STEP-XDE
// read yields occurrence structure, product/subshape names, and stamped
// `geospec:facts` properties together with retained placed shapes so exact
// BRep proof queries (extrema, classification, boolean common, face facts)
// run without a second parse. JavaScript receives compact JSON only.
//
// Deterministic orderings relied on by consumers (SB3 selector index):
// - `faceIndex` is the 0-based position of a face in
//   `TopExp_Explorer(productShape, TopAbs_FACE)` traversal order over the
//   owning product shape. The placed occurrence shape preserves that order
//   (a TopLoc_Location move does not reorder traversal), so proof calls may
//   address faces of the placed shape with the same index.
// - Occurrence paths are dot-joined instance-name segments from the root
//   (root omitted). When the same segment name repeats under one parent, the
//   segments are disambiguated `name[k]` (1-based) in the parent's stored
//   XCAF component-label order, which mirrors NAUO order in the file.
//
// Known limitation (documented for SB3): `geospec:facts` properties are
// attributed to occurrences by owning *product name*, not by product label
// identity, because the STEP entity model and the XCAF label space are only
// joined by name here. Two distinct products sharing one name would
// cross-attribute properties. Conforming producers use unique product names.

#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepBndLib.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepGProp.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Interface_EntityIterator.hxx>
#include <Interface_Graph.hxx>
#include <Interface_InterfaceModel.hxx>
#include <Interface_Static.hxx>
#include <NCollection_Sequence.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <StepBasic_Product.hxx>
#include <StepBasic_ProductDefinition.hxx>
#include <StepBasic_ProductDefinitionFormation.hxx>
#include <StepRepr_CharacterizedDefinition.hxx>
#include <StepRepr_DescriptiveRepresentationItem.hxx>
#include <StepRepr_ProductDefinitionShape.hxx>
#include <StepRepr_PropertyDefinition.hxx>
#include <StepRepr_PropertyDefinitionRepresentation.hxx>
#include <StepRepr_Representation.hxx>
#include <StepRepr_ShapeAspect.hxx>
#include <TCollection_AsciiString.hxx>
#include <TCollection_ExtendedString.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopAbs_State.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XSControl_WorkSession.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>

struct GeoSpecXdeOccurrenceRecord {
  std::string path;
  std::string productName;
  std::string instanceName;
  bool hasInstanceName = false;
  gp_Trsf transform;
  int shapeIndex = -1;
  std::string productLabelEntry;
};

struct GeoSpecXdeSubshapeRow {
  std::string occurrencePath;
  std::string name;
  std::string shapeType;
  int faceIndex = -1;
};

struct GeoSpecXdePropertyRow {
  std::string occurrencePath;
  std::string name;
  std::string payload;
};

static std::string geospecXdeEscapeJson(const std::string& value) {
  std::ostringstream output;
  for (char character : value) {
    switch (character) {
      case '\\': output << "\\\\"; break;
      case '"': output << "\\\""; break;
      case '\n': output << "\\n"; break;
      case '\r': output << "\\r"; break;
      case '\t': output << "\\t"; break;
      default: output << character; break;
    }
  }
  return output.str();
}

static std::string geospecXdeErrorJson(const std::string& message) {
  return "{\"error\":\"" + geospecXdeEscapeJson(message) + "\"}";
}

static void geospecXdeAppendPoint(std::ostringstream& output, const gp_Pnt& point) {
  output << "[" << point.X() << "," << point.Y() << "," << point.Z() << "]";
}

static void geospecXdeAppendDir(std::ostringstream& output, const gp_Dir& direction) {
  output << "[" << direction.X() << "," << direction.Y() << "," << direction.Z() << "]";
}

static std::string geospecXdeLabelName(const TDF_Label& label) {
  Handle(TDataStd_Name) nameAttribute;
  if (label.IsNull() || !label.FindAttribute(TDataStd_Name::GetID(), nameAttribute)) {
    return "";
  }
  // Second argument 0 requests UTF-8 conversion instead of lossy '?' replacement.
  const TCollection_AsciiString ascii(nameAttribute->Get(), 0);
  return ascii.ToCString();
}

static std::string geospecXdeLabelEntry(const TDF_Label& label) {
  TCollection_AsciiString entry;
  TDF_Tool::Entry(label, entry);
  return entry.ToCString();
}

static std::string geospecXdeHAsciiToString(const Handle(TCollection_HAsciiString)& value) {
  return value.IsNull() ? "" : value->ToCString();
}

static std::string geospecXdeShapeTypeName(TopAbs_ShapeEnum shapeType) {
  switch (shapeType) {
    case TopAbs_FACE: return "face";
    case TopAbs_EDGE: return "edge";
    case TopAbs_VERTEX: return "vertex";
    case TopAbs_SOLID: return "solid";
    default: return "";
  }
}

// Applies the profile's `name[k]` disambiguation to sibling segments in
// stored component order; only repeated names receive an index.
static std::vector<std::string> geospecXdeDisambiguateSegments(const std::vector<std::string>& names) {
  std::map<std::string, int> totals;
  for (const std::string& name : names) {
    totals[name]++;
  }
  std::map<std::string, int> counters;
  std::vector<std::string> segments;
  segments.reserve(names.size());
  for (const std::string& name : names) {
    if (totals[name] > 1) {
      counters[name]++;
      segments.push_back(name + "[" + std::to_string(counters[name]) + "]");
    } else {
      segments.push_back(name);
    }
  }
  return segments;
}

static std::string geospecXdeProductNameFromProductDefinition(const Handle(StepBasic_ProductDefinition)& productDefinition) {
  if (productDefinition.IsNull() || productDefinition->Formation().IsNull()) {
    return "";
  }
  const Handle(StepBasic_Product) product = productDefinition->Formation()->OfProduct();
  if (product.IsNull()) {
    return "";
  }
  return geospecXdeHAsciiToString(product->Name());
}

static std::string geospecXdeProductNameFromShapeDefinition(const Handle(StepRepr_ProductDefinitionShape)& shapeDefinition) {
  if (shapeDefinition.IsNull()) {
    return "";
  }
  return geospecXdeProductNameFromProductDefinition(shapeDefinition->Definition().ProductDefinition());
}

class GeoSpecXdeReadResult {
public:
  GeoSpecXdeReadResult() : success_(false), resultJson_(geospecXdeErrorJson("GeoSpec XDE reader produced no result.")) {}

  bool isSuccess() const {
    return success_;
  }

  std::string resultJson() const {
    return resultJson_;
  }

  // Exact minimum distance between two placed occurrence shapes (or single
  // located faces when faceIndex >= 0). Results are in the subject frame.
  std::string extrema(int occurrenceA, int faceA, int occurrenceB, int faceB) const {
    try {
      std::string error;
      const TopoDS_Shape shapeA = resolveProofShape(occurrenceA, faceA, error);
      if (!error.empty()) return geospecXdeErrorJson(error);
      const TopoDS_Shape shapeB = resolveProofShape(occurrenceB, faceB, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      BRepExtrema_DistShapeShape distance(shapeA, shapeB);
      if (!distance.IsDone() || distance.NbSolution() < 1) {
        return geospecXdeErrorJson("GeoSpec XDE extrema computation did not converge.");
      }
      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"distance\":" << distance.Value() << ",\"pointA\":";
      geospecXdeAppendPoint(json, distance.PointOnShape1(1));
      json << ",\"pointB\":";
      geospecXdeAppendPoint(json, distance.PointOnShape2(1));
      json << "}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE extrema failed with an unknown native error.");
    }
  }

  // Classifies points (JSON `[[x,y,z],...]`) against the placed occurrence
  // solid with tolerance 1e-7.
  std::string classifyPoints(int occurrence, const std::string& pointsJson) const {
    try {
      std::string error;
      const TopoDS_Shape shape = resolveProofShape(occurrence, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      std::vector<double> values;
      const char* cursor = pointsJson.c_str();
      while (*cursor != '\0') {
        if ((*cursor >= '0' && *cursor <= '9') || *cursor == '-' || *cursor == '+' || *cursor == '.') {
          char* end = nullptr;
          const double value = std::strtod(cursor, &end);
          if (end != cursor) {
            values.push_back(value);
            cursor = end;
            continue;
          }
        }
        cursor++;
      }
      if (values.empty() || values.size() % 3 != 0) {
        return geospecXdeErrorJson("GeoSpec XDE classifyPoints expects JSON [[x,y,z],...] triples.");
      }

      BRepClass3d_SolidClassifier classifier(shape);
      std::ostringstream json;
      json << "{\"states\":[";
      for (std::size_t index = 0; index + 2 < values.size(); index += 3) {
        if (index > 0) json << ",";
        classifier.Perform(gp_Pnt(values[index], values[index + 1], values[index + 2]), 1e-7);
        // ponytail: TopAbs_UNKNOWN maps to "out"; a dedicated state can arrive with a consumer.
        const char* state = classifier.State() == TopAbs_IN ? "in" : classifier.State() == TopAbs_ON ? "on" : "out";
        json << "\"" << state << "\"";
      }
      json << "]}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE classifyPoints failed with an unknown native error.");
    }
  }

  // Exact boolean-common volume and centroid of two placed occurrence shapes.
  std::string commonVolume(int occurrenceA, int occurrenceB) const {
    try {
      std::string error;
      const TopoDS_Shape shapeA = resolveProofShape(occurrenceA, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);
      const TopoDS_Shape shapeB = resolveProofShape(occurrenceB, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      BRepAlgoAPI_Common common(shapeA, shapeB);
      common.Build();
      if (!common.IsDone()) {
        return geospecXdeErrorJson("GeoSpec XDE boolean common failed.");
      }
      GProp_GProps properties;
      BRepGProp::VolumeProperties(common.Shape(), properties);
      const double volume = std::abs(properties.Mass());
      gp_Pnt centroid(0.0, 0.0, 0.0);
      if (volume > 1e-12) {
        centroid = properties.CentreOfMass();
      }
      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"volume\":" << volume << ",\"centroid\":";
      geospecXdeAppendPoint(json, centroid);
      json << "}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE commonVolume failed with an unknown native error.");
    }
  }

  // Analytic per-face facts for the placed occurrence shape in deterministic
  // face traversal order (see header comment). Subject frame.
  std::string faceFacts(int occurrence) const {
    try {
      std::string error;
      const TopoDS_Shape shape = resolveProofShape(occurrence, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"faces\":[";
      int faceIndex = 0;
      for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next(), faceIndex++) {
        const TopoDS_Face& face = TopoDS::Face(explorer.Current());
        if (faceIndex > 0) json << ",";
        json << "{\"faceIndex\":" << faceIndex;

        BRepAdaptor_Surface surface(face, false);
        const GeomAbs_SurfaceType surfaceType = surface.GetType();
        const char* surfaceTypeName =
          surfaceType == GeomAbs_Plane ? "plane"
          : surfaceType == GeomAbs_Cylinder ? "cylinder"
          : surfaceType == GeomAbs_Cone ? "cone"
          : surfaceType == GeomAbs_Sphere ? "sphere"
          : surfaceType == GeomAbs_Torus ? "torus"
          : (surfaceType == GeomAbs_BSplineSurface || surfaceType == GeomAbs_BezierSurface) ? "bspline"
          : "other";
        json << ",\"surfaceType\":\"" << surfaceTypeName << "\"";

        if (surfaceType == GeomAbs_Plane) {
          const gp_Pln plane = surface.Plane();
          gp_Dir normal = plane.Axis().Direction();
          if (face.Orientation() == TopAbs_REVERSED) {
            normal.Reverse();
          }
          const gp_Pnt planePoint = plane.Location();
          const double offset =
            normal.X() * planePoint.X() + normal.Y() * planePoint.Y() + normal.Z() * planePoint.Z();
          json << ",\"normal\":";
          geospecXdeAppendDir(json, normal);
          json << ",\"offset\":" << offset;
        } else if (surfaceType == GeomAbs_Cylinder) {
          const gp_Cylinder cylinder = surface.Cylinder();
          json << ",\"axisOrigin\":";
          geospecXdeAppendPoint(json, cylinder.Axis().Location());
          json << ",\"axisDirection\":";
          geospecXdeAppendDir(json, cylinder.Axis().Direction());
          json << ",\"radius\":" << cylinder.Radius();
        } else if (surfaceType == GeomAbs_Cone) {
          const gp_Cone cone = surface.Cone();
          json << ",\"axisOrigin\":";
          geospecXdeAppendPoint(json, cone.Axis().Location());
          json << ",\"axisDirection\":";
          geospecXdeAppendDir(json, cone.Axis().Direction());
          json << ",\"radius\":" << cone.RefRadius();
        }

        GProp_GProps faceProperties;
        BRepGProp::SurfaceProperties(face, faceProperties);
        json << ",\"area\":" << faceProperties.Mass() << ",\"centroid\":";
        geospecXdeAppendPoint(json, faceProperties.CentreOfMass());

        Bnd_Box box;
        BRepBndLib::Add(face, box);
        double xmin = 0.0, ymin = 0.0, zmin = 0.0, xmax = 0.0, ymax = 0.0, zmax = 0.0;
        if (!box.IsVoid()) {
          box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
        }
        json << ",\"bounds\":{\"min\":[" << xmin << "," << ymin << "," << zmin << "],\"max\":[" << xmax << ","
             << ymax << "," << zmax << "]}}";
      }
      json << "]}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE faceFacts failed with an unknown native error.");
    }
  }

private:
  friend class GeoSpecXdeReader;

  TopoDS_Shape resolveProofShape(int occurrence, int faceIndex, std::string& error) const {
    error.clear();
    if (occurrence < 0 || static_cast<std::size_t>(occurrence) >= placedShapes_.size()) {
      error = "GeoSpec XDE occurrence index " + std::to_string(occurrence) + " is out of range.";
      return TopoDS_Shape();
    }
    const TopoDS_Shape& placed = placedShapes_[static_cast<std::size_t>(occurrence)];
    if (faceIndex < 0) {
      return placed;
    }
    int index = 0;
    for (TopExp_Explorer explorer(placed, TopAbs_FACE); explorer.More(); explorer.Next(), index++) {
      if (index == faceIndex) {
        return explorer.Current();
      }
    }
    error = "GeoSpec XDE face index " + std::to_string(faceIndex) + " is out of range for occurrence " +
      std::to_string(occurrence) + ".";
    return TopoDS_Shape();
  }

  bool success_;
  std::string resultJson_;
  std::vector<TopoDS_Shape> placedShapes_;
};

class GeoSpecXdeReader {
public:
  static GeoSpecXdeReadResult readText(const std::string& data) {
    try {
      std::istringstream stream(data);
      // The reader constructor runs STEPCAFControl_Controller::Init(), which
      // registers (and zeroes) this static — setting it earlier is a silent
      // no-op on the first read in a fresh module.
      STEPCAFControl_Reader reader;
      Interface_Static::SetIVal("read.stepcaf.subshapes.name", 1);
      reader.SetNameMode(true);
      const IFSelect_ReturnStatus status = reader.ReadStream("memory.step", stream);
      return finishRead(reader, status);
    } catch (const std::exception& error) {
      return failure(error.what());
    } catch (...) {
      return failure("GeoSpec XDE reader failed with an unknown native error.");
    }
  }

  static GeoSpecXdeReadResult readFile(const std::string& path) {
    try {
      // Reader construction first — see readText for the registration order.
      STEPCAFControl_Reader reader;
      Interface_Static::SetIVal("read.stepcaf.subshapes.name", 1);
      reader.SetNameMode(true);
      const IFSelect_ReturnStatus status = reader.ReadFile(path.c_str());
      return finishRead(reader, status);
    } catch (const std::exception& error) {
      return failure(error.what());
    } catch (...) {
      return failure("GeoSpec XDE reader failed with an unknown native error.");
    }
  }

private:
  static GeoSpecXdeReadResult failure(const std::string& message) {
    GeoSpecXdeReadResult result;
    result.success_ = false;
    result.resultJson_ = geospecXdeErrorJson(message);
    return result;
  }

  static GeoSpecXdeReadResult finishRead(STEPCAFControl_Reader& reader, IFSelect_ReturnStatus status) {
    if (status != IFSelect_RetDone) {
      return failure("GeoSpec XDE reader could not parse the STEP source.");
    }

    // Deliberately no XCAFApp_Application: its constructor registers the
    // XCAFPrs presentation driver (TPrsStd_DriverTable + XCAFPrs_Driver),
    // which this visualization-stripped verification-kernel build links as
    // dormant abort stubs. Creating the document directly keeps the whole
    // presentation stack out of the wasm and out of the runtime path.
    Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::Set(document->Main());
    if (!reader.Transfer(document)) {
      return failure("GeoSpec XDE reader did not transfer any STEP roots.");
    }

    const Handle(XCAFDoc_ShapeTool) shapeTool = XCAFDoc_DocumentTool::ShapeTool(document->Main());
    if (shapeTool.IsNull()) {
      return failure("GeoSpec XDE reader could not access the XCAF shape tool.");
    }

    GeoSpecXdeReadResult result;
    std::vector<GeoSpecXdeOccurrenceRecord> occurrences;
    std::vector<TopoDS_Shape> productShapes;
    std::vector<TDF_Label> productLabels;
    std::map<std::string, int> productShapeIndexByEntry;
    int freeShapeCount = 0;

    NCollection_Sequence<TDF_Label> freeLabels;
    shapeTool->GetFreeShapes(freeLabels);

    // Free non-assembly shapes: the flat-export degenerate case. Assemblies
    // recurse into components; the assembly root itself is path-omitted.
    // ponytail: multiple root assemblies would share the path namespace; the
    // profile mandates one root product, so no cross-root disambiguation here.
    std::vector<std::string> freeNames;
    std::vector<TDF_Label> flatLabels;
    for (int index = 1; index <= freeLabels.Length(); index++) {
      const TDF_Label& label = freeLabels.Value(index);
      if (!XCAFDoc_ShapeTool::IsAssembly(label)) {
        flatLabels.push_back(label);
        freeNames.push_back(geospecXdeLabelName(label));
      }
    }
    const std::vector<std::string> flatSegments = geospecXdeDisambiguateSegments(freeNames);
    for (std::size_t index = 0; index < flatLabels.size(); index++) {
      const TDF_Label& label = flatLabels[index];
      freeShapeCount++;
      GeoSpecXdeOccurrenceRecord record;
      record.path = flatSegments[index];
      record.productName = freeNames[index];
      record.hasInstanceName = false;
      record.transform = XCAFDoc_ShapeTool::GetLocation(label).Transformation();
      record.shapeIndex = internProductShape(label, productShapes, productLabels, productShapeIndexByEntry);
      record.productLabelEntry = geospecXdeLabelEntry(label);
      occurrences.push_back(record);
    }
    for (int index = 1; index <= freeLabels.Length(); index++) {
      const TDF_Label& label = freeLabels.Value(index);
      if (XCAFDoc_ShapeTool::IsAssembly(label)) {
        walkComponents(label, "", gp_Trsf(), occurrences, productShapes, productLabels, productShapeIndexByEntry);
      }
    }

    result.placedShapes_.reserve(occurrences.size());
    for (const GeoSpecXdeOccurrenceRecord& record : occurrences) {
      const TopoDS_Shape& productShape = productShapes[static_cast<std::size_t>(record.shapeIndex)];
      result.placedShapes_.push_back(productShape.Moved(TopLoc_Location(record.transform)));
    }

    const std::vector<GeoSpecXdeSubshapeRow> subshapeRows =
      collectSubshapeRows(occurrences, productShapes, productLabels);
    const std::vector<GeoSpecXdePropertyRow> propertyRows = collectPropertyRows(reader, occurrences);

    result.success_ = true;
    result.resultJson_ = emitResultJson(occurrences, subshapeRows, propertyRows, freeShapeCount);
    return result;
  }

  static int internProductShape(
    const TDF_Label& productLabel,
    std::vector<TopoDS_Shape>& productShapes,
    std::vector<TDF_Label>& productLabels,
    std::map<std::string, int>& productShapeIndexByEntry
  ) {
    const std::string entry = geospecXdeLabelEntry(productLabel);
    const auto existing = productShapeIndexByEntry.find(entry);
    if (existing != productShapeIndexByEntry.end()) {
      return existing->second;
    }
    const int index = static_cast<int>(productShapes.size());
    productShapes.push_back(XCAFDoc_ShapeTool::GetShape(productLabel));
    productLabels.push_back(productLabel);
    productShapeIndexByEntry[entry] = index;
    return index;
  }

  static void walkComponents(
    const TDF_Label& assemblyLabel,
    const std::string& pathPrefix,
    const gp_Trsf& parentTransform,
    std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    std::vector<TopoDS_Shape>& productShapes,
    std::vector<TDF_Label>& productLabels,
    std::map<std::string, int>& productShapeIndexByEntry
  ) {
    NCollection_Sequence<TDF_Label> components;
    if (!XCAFDoc_ShapeTool::GetComponents(assemblyLabel, components)) {
      return;
    }

    std::vector<std::string> segmentNames;
    for (int index = 1; index <= components.Length(); index++) {
      const TDF_Label& instanceLabel = components.Value(index);
      std::string instanceName = geospecXdeLabelName(instanceLabel);
      if (instanceName.empty()) {
        TDF_Label productLabel;
        if (XCAFDoc_ShapeTool::GetReferredShape(instanceLabel, productLabel)) {
          instanceName = geospecXdeLabelName(productLabel);
        }
      }
      segmentNames.push_back(instanceName);
    }
    const std::vector<std::string> segments = geospecXdeDisambiguateSegments(segmentNames);

    for (int index = 1; index <= components.Length(); index++) {
      const TDF_Label& instanceLabel = components.Value(index);
      TDF_Label productLabel;
      if (!XCAFDoc_ShapeTool::GetReferredShape(instanceLabel, productLabel)) {
        continue;
      }
      const std::string instanceName = geospecXdeLabelName(instanceLabel);
      const std::string& segment = segments[static_cast<std::size_t>(index - 1)];
      const std::string path = pathPrefix.empty() ? segment : pathPrefix + "." + segment;
      const gp_Trsf transform =
        parentTransform.Multiplied(XCAFDoc_ShapeTool::GetLocation(instanceLabel).Transformation());

      GeoSpecXdeOccurrenceRecord record;
      record.path = path;
      record.productName = geospecXdeLabelName(productLabel);
      record.instanceName = instanceName;
      record.hasInstanceName = !instanceName.empty();
      record.transform = transform;
      record.shapeIndex = internProductShape(productLabel, productShapes, productLabels, productShapeIndexByEntry);
      record.productLabelEntry = geospecXdeLabelEntry(productLabel);
      occurrences.push_back(record);

      if (XCAFDoc_ShapeTool::IsAssembly(productLabel)) {
        walkComponents(productLabel, path, transform, occurrences, productShapes, productLabels, productShapeIndexByEntry);
      }
    }
  }

  // Product-level subshape names expanded to one row per occurrence of the
  // owning product, so consumers compose `<occurrencePath>.<name>` directly.
  static std::vector<GeoSpecXdeSubshapeRow> collectSubshapeRows(
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    const std::vector<TopoDS_Shape>& productShapes,
    const std::vector<TDF_Label>& productLabels
  ) {
    std::vector<GeoSpecXdeSubshapeRow> rows;
    for (std::size_t productIndex = 0; productIndex < productLabels.size(); productIndex++) {
      NCollection_Sequence<TDF_Label> subshapeLabels;
      if (!XCAFDoc_ShapeTool::GetSubShapes(productLabels[productIndex], subshapeLabels)) {
        continue;
      }
      const TopoDS_Shape& productShape = productShapes[productIndex];
      for (int index = 1; index <= subshapeLabels.Length(); index++) {
        const TDF_Label& subshapeLabel = subshapeLabels.Value(index);
        const std::string name = geospecXdeLabelName(subshapeLabel);
        if (name.empty()) {
          continue;
        }
        const TopoDS_Shape subshape = XCAFDoc_ShapeTool::GetShape(subshapeLabel);
        if (subshape.IsNull()) {
          continue;
        }
        const std::string shapeType = geospecXdeShapeTypeName(subshape.ShapeType());
        if (shapeType.empty()) {
          continue;
        }
        int faceIndex = -1;
        if (subshape.ShapeType() == TopAbs_FACE) {
          int candidate = 0;
          for (TopExp_Explorer explorer(productShape, TopAbs_FACE); explorer.More(); explorer.Next(), candidate++) {
            if (explorer.Current().IsSame(subshape)) {
              faceIndex = candidate;
              break;
            }
          }
        }
        for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
          if (occurrence.shapeIndex == static_cast<int>(productIndex)) {
            rows.push_back({occurrence.path, name, shapeType, faceIndex});
          }
        }
      }
    }
    return rows;
  }

  // Reads `geospec:facts` properties directly from the STEP entity model:
  // XCAF does not surface user-defined property_definitions, so this walks
  // PROPERTY_DEFINITION -> PROPERTY_DEFINITION_REPRESENTATION ->
  // DESCRIPTIVE_REPRESENTATION_ITEM and attributes each payload to its owning
  // product from either attachment leg the profile defines: a named
  // SHAPE_ASPECT (face/axis interfaces) or the product definition itself
  // (datum interfaces). Product-to-occurrence mapping is by product name
  // (see the header-comment limitation).
  static std::vector<GeoSpecXdePropertyRow> collectPropertyRows(
    STEPCAFControl_Reader& reader,
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences
  ) {
    std::vector<GeoSpecXdePropertyRow> rows;
    const Handle(XSControl_WorkSession) session = reader.Reader().WS();
    if (session.IsNull()) {
      return rows;
    }
    const Handle(Interface_InterfaceModel) model = session->Model();
    if (model.IsNull()) {
      return rows;
    }
    const Interface_Graph& graph = session->Graph();

    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepRepr_PropertyDefinition) property =
        Handle(StepRepr_PropertyDefinition)::DownCast(model->Value(entityIndex));
      if (property.IsNull() || !property->HasDescription() || property->Description().IsNull()) {
        continue;
      }
      if (geospecXdeHAsciiToString(property->Description()) != "geospec:facts") {
        continue;
      }
      const std::string interfaceName = geospecXdeHAsciiToString(property->Name());
      if (interfaceName.empty()) {
        continue;
      }

      std::string payload;
      Interface_EntityIterator sharings = graph.Sharings(property);
      for (sharings.Start(); payload.empty() && sharings.More(); sharings.Next()) {
        const Handle(StepRepr_PropertyDefinitionRepresentation) propertyRepresentation =
          Handle(StepRepr_PropertyDefinitionRepresentation)::DownCast(sharings.Value());
        if (propertyRepresentation.IsNull()) {
          continue;
        }
        const Handle(StepRepr_Representation) representation = propertyRepresentation->UsedRepresentation();
        if (representation.IsNull() || representation->Items().IsNull()) {
          continue;
        }
        for (int itemIndex = 1; itemIndex <= representation->NbItems(); itemIndex++) {
          const Handle(StepRepr_DescriptiveRepresentationItem) descriptive =
            Handle(StepRepr_DescriptiveRepresentationItem)::DownCast(representation->ItemsValue(itemIndex));
          if (!descriptive.IsNull() && !descriptive->Description().IsNull()) {
            payload = geospecXdeHAsciiToString(descriptive->Description());
            break;
          }
        }
      }
      if (payload.empty()) {
        continue;
      }

      std::string productName;
      const StepRepr_CharacterizedDefinition definition = property->Definition();
      const Handle(StepRepr_ShapeAspect) aspect = definition.ShapeAspect();
      if (!aspect.IsNull()) {
        productName = geospecXdeProductNameFromShapeDefinition(aspect->OfShape());
      } else if (!definition.ProductDefinitionShape().IsNull()) {
        productName = geospecXdeProductNameFromShapeDefinition(definition.ProductDefinitionShape());
      } else if (!definition.ProductDefinition().IsNull()) {
        productName = geospecXdeProductNameFromProductDefinition(definition.ProductDefinition());
      }
      if (productName.empty()) {
        continue;
      }

      for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
        if (occurrence.productName == productName) {
          rows.push_back({occurrence.path, interfaceName, payload});
        }
      }
    }
    return rows;
  }

  static std::string emitResultJson(
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    const std::vector<GeoSpecXdeSubshapeRow>& subshapeRows,
    const std::vector<GeoSpecXdePropertyRow>& propertyRows,
    int freeShapeCount
  ) {
    std::ostringstream json;
    json << std::setprecision(17);
    json << "{\"occurrences\":[";
    for (std::size_t index = 0; index < occurrences.size(); index++) {
      const GeoSpecXdeOccurrenceRecord& record = occurrences[index];
      if (index > 0) json << ",";
      json << "{\"path\":\"" << geospecXdeEscapeJson(record.path) << "\",\"productName\":\""
           << geospecXdeEscapeJson(record.productName) << "\"";
      if (record.hasInstanceName) {
        json << ",\"instanceName\":\"" << geospecXdeEscapeJson(record.instanceName) << "\"";
      }
      json << ",\"transform\":[";
      for (int row = 1; row <= 3; row++) {
        for (int column = 1; column <= 4; column++) {
          if (row > 1 || column > 1) json << ",";
          json << record.transform.Value(row, column);
        }
      }
      json << ",0,0,0,1],\"shapeIndex\":" << record.shapeIndex << "}";
    }
    json << "],\"subshapeNames\":[";
    for (std::size_t index = 0; index < subshapeRows.size(); index++) {
      const GeoSpecXdeSubshapeRow& row = subshapeRows[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"shapeType\":\"" << row.shapeType
           << "\",\"faceIndex\":" << row.faceIndex << "}";
    }
    json << "],\"properties\":[";
    for (std::size_t index = 0; index < propertyRows.size(); index++) {
      const GeoSpecXdePropertyRow& row = propertyRows[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"payload\":\"" << geospecXdeEscapeJson(row.payload) << "\"}";
    }
    json << "],\"freeShapeCount\":" << freeShapeCount << "}";
    return json.str();
  }
};

// Dormant data-symbol stubs for the visualization-stripped verification
// kernel. TKDESTEP's vis-material support drags XCAFDoc_VisMaterial.o and
// XCAFPrs_Texture.o into the link, and those reference two Graphic3d vtable/
// typeinfo symbols from the excluded TKService toolkit. Undefined *function*
// symbols become abort stubs via -sERROR_ON_UNDEFINED_SYMBOLS=0 (see
// geospec.single.yml), but wasm-ld cannot leave *data* symbols undefined, so
// they are defined here as zero-filled blobs. They are only dereferenced when
// constructing visualization texture objects (XCAFDoc_VisMaterial::
// FillMaterialAspect and friends), which no STEP read/proof path executes.
// Weak: this wrapper file is included into every generated binding TU, so a
// strong definition would duplicate across them.
extern "C" {
// vtable for Graphic3d_TextureSet
char _ZTV20Graphic3d_TextureSet[64] __attribute__((weak, aligned(8))) = {};
// typeinfo for Graphic3d_Texture2D
char _ZTI19Graphic3d_Texture2D[64] __attribute__((weak, aligned(8))) = {};
}
