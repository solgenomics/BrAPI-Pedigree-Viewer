;(function(){
    window.PedigreeViewer = PedigreeViewer;
    function PedigreeViewer(server){
        var pdgv = {};
        var base_url = server;
        if (base_url.slice(0,8)!="https://" && base_url.slice(0,7)!="http://"){
            base_url ="https://"+base_url;
        }
        if (base_url.slice(-1)!="/"){
            base_url+="/";
        }
        var root = null;
        var access_token = null;
        var loaded_nodes = {};
        var myTree = null;
        var locationSelector = null;
        
        
        pdgv.auth = function(username,password,callback){
            $.ajax({
                type: "POST",
                url: base_url+"brapi/v1/token",
                data: {'username':username,'password':password},
                success: function(response){
                    access_token = response.access_token;
                    callback.call(pdgv);
                },
            });
        };
        
        pdgv.newTree = function(stock_id,callback){
            loaded_nodes = {};
            load_nodes([stock_id],function(nodes){
                nodes.forEach(function(node){
                    root = node.id;
                });
                createNewTree(nodes);
                callback.call(pdgv);
            });
        };
        
        pdgv.drawViewer = function(loc){
            locationSelector = loc
            drawTree();
        }
        
        function createNewTree(start_nodes) {  
            myTree = d3.pedigreeTree()
              .levelWidth(200)
              .levelMidpoint(50)
              .nodePadding(220)
              .nodeWidth(10)
              .linkPadding(25)
              .vertical(true)
              .parentsOrdered(true)
              .parents(function(node){
                return [loaded_nodes[node.mother_id],loaded_nodes[node.father_id]].filter(Boolean);
              })
              .id(function(node){
                return node.id;
              })
              .groupChildless(true)
              .iterations(10)
              .data(start_nodes)
              .excludeFromGrouping([root]);
        }
        
        function load_nodes(stock_ids,callback){
            var total = stock_ids.length;
            var nodes = stock_ids.map(function(){return null});
            var response_count = 0;
            var collector = function(i,node){
                response_count+=1;
                nodes[i] = node;
                if(response_count==total){
                    nodes = nodes.filter(function(node){
                        if (!loaded_nodes.hasOwnProperty(node.id)){
                            loaded_nodes[node.id] = node;
                            return true;
                        }
                        return false;
                    });
                    callback(nodes);
                }
            };
            stock_ids.forEach(function(stock_id,i){
                _load_node(stock_id,function(node){
                    collector(i,node);
                });
            });
        }
        
        function _load_node(stock_id,callback){
            var callback_wrapper = function(parents,progeny){
                if(parents!=null){
                    callback_wrapper.parents = parents;
                }
                if(progeny!=null){
                    callback_wrapper.progeny = progeny;
                }
                if(callback_wrapper.parents!=undefined&&callback_wrapper.progeny!=undefined){
                    callback({
                        'id':callback_wrapper.parents.result.germplasmDbId,
                        'mother_id':callback_wrapper.parents.result.parent1Id,
                        'father_id':callback_wrapper.parents.result.parent2Id,
                        'name':callback_wrapper.progeny.result.defaultDisplayName,
                        'children':callback_wrapper.progeny.result.data.filter(Boolean).map(function(d){
                            return d.progenyGermplasmDbId;
                        })
                    });
                }
            }
            $.ajax({
                type: "GET",
                url: base_url+"brapi/v1/germplasm/"+stock_id+"/pedigree",
                data: {},
                success: function(response){callback_wrapper(response,null)},
            });
            $.ajax({
                type: "GET",
                url: base_url+"brapi/v1/germplasm/"+stock_id+"/progeny",
                data: {
                    "pageSize" : 10000000,
                    "page" : 0
                },
                success: function(response){callback_wrapper(null,response)},
            });
        }
        
        function drawTree(trans){
            
            var layout = myTree();
            var svg_selector = locationSelector;
            
            //set default change-transtion to no duration
            trans = trans || d3.transition().duration(0);
            
            //make wrapper(pdg)
            var canv = d3.select(svg_selector);
            var cbbox = canv.node().getBoundingClientRect();
            var canvw = cbbox.width, 
                canvh = cbbox.height;
            var pdg = canv.select('.pedigreeTree');
            if (pdg.empty()){
              pdg = canv.append('g').classed('pedigreeTree',true);
            }
          
            //make background
            var bg = pdg.select('.pdg-bg');
            if (bg.empty()){
              bg = pdg.append('rect')
                .classed('pdg-bg',true)
                .attr("x",-canvw*500)
                .attr("y",-canvh*500)
                .attr('width',canvw*1000)
                .attr('height',canvh*1000)
                .attr('fill',"white")
                .attr('stroke','none');
            }
            
            //make scaled content/zoom groups
            var padding = 50;
            var pdgtree_width = d3.max([500,layout.x[1]-layout.x[0]]);
            var pdgtree_height = d3.max([500,layout.y[1]-layout.y[0]]);
            var centeringx = d3.max([0,(500 - (layout.x[1]-layout.x[0]))/2]);
            var centeringy = d3.max([0,(500 - (layout.y[1]-layout.y[0]))/2]);
            var scale = get_fit_scale(canvw,canvh,pdgtree_width,pdgtree_height,padding);
            var offsetx = (canvw-(pdgtree_width)*scale)/2 + centeringx*scale;
            var offsety = (canvh-(pdgtree_height)*scale)/2 + centeringy*scale;
            
            var content = pdg.select('.pdg-content');
            if (content.empty()){
              var zoom = d3.zoom();
              var zoom_group = pdg.append('g').classed('pdg-zoom',true).data([zoom]);
              
              content = zoom_group.append('g').classed('pdg-content',true);
              content.datum({'zoom':zoom})
              zoom.on("zoom",function(){
                zoom_group.attr('transform',d3.event.transform);
              });
              bg.style("cursor", "all-scroll").call(zoom).call(zoom.transform, d3.zoomIdentity);
              bg.on("dblclick.zoom",function(){
                zoom.transform(bg.transition(),d3.zoomIdentity);
                return false;
              });
              
              content.attr('transform',
                  d3.zoomIdentity
                    .translate(offsetx,offsety)
                    .scale(scale)
                );
            }
            content.datum().zoom.scaleExtent([0.5,d3.max([pdgtree_height,pdgtree_width])/200])
            content.transition(trans)
              .attr('transform',
                d3.zoomIdentity
                  .translate(offsetx,offsety)
                  .scale(scale)
              );
            
            
            //set up draw layers
            var linkLayer = content.select('.link-layer');
            if(linkLayer.empty()){
                linkLayer = content.append('g').classed('link-layer',true);
            }
            var nodeLayer = content.select('.node-layer');
            if(nodeLayer.empty()){
                nodeLayer = content.append('g').classed('node-layer',true);
            }
            
            //link curve generators
            var stepline = d3.line().curve(d3.curveStepAfter);
            var curveline = d3.line().curve(d3.curveBasis);
            var build_curve = function(d){
              if (d.type=="parent->mid") return curveline(d.path);
              if (d.type=="mid->child") return stepline(d.path);
            };
            
            //draw nodes
            var nodes = nodeLayer.selectAll('.node')
              .data(layout.nodes,function(d){return d.id;});
            var newNodes = nodes.enter().append('g')
              .classed('node',true)
              .attr('transform',function(d){
                var begin = d;
                if(d3.event && d3.event.type=="click"){
                  begin = d3.select(d3.event.target).datum();
                }
                return 'translate('+begin.x+','+begin.y+')'
              });
            var nodeNodes = newNodes.filter(function(d){
                return d.type=="node";
            });
            var groupNodes = newNodes.filter(function(d){
                return d.type=="node-group";
            });
            //draw node group expanders
            groupNodes.append("circle")
              .style("cursor","pointer")
              .attr("fill","purple")
              .attr("stroke","purple")
              .attr("cy",0)
              .attr("r",10);
            groupNodes.append('text')
              .style("cursor","pointer")
              .attr('y',6.5)
              .attr("font-size","14px")
              .attr("font-weight","bold")
              .attr('text-anchor',"middle")
              .attr('class', 'glyphicon')
              .html("&#xe092;")
              .attr('fill',"white");
            //create expander handles on nodes
            var expanders = nodeNodes.append('g').classed("expanders",true);
            var child_expander = expanders.append("g").classed("child-expander",true)
            child_expander.append("path")
              .attr("fill","none")
              .attr("stroke","purple")
              .attr("stroke-width",4)
              .attr("d",curveline([[0,20],[0,40]]));
            child_expander.append("circle")
              .style("cursor","pointer")
              .attr("fill","purple")
              .attr("stroke","purple")
              .attr("cy",45)
              .attr("r",10);
            child_expander.append('text')
              .style("cursor","pointer")
              .attr('y',52)
              .attr('x',-0.5)
              .attr("font-size","14px")
              .attr("font-weight","bold")
              .attr('text-anchor',"middle")
              .attr('class', 'glyphicon')
              .html("&#xe094;")
              .attr('fill',"white");
            child_expander.on("click",function(d){
              d3.select(this).on('click',null);
              var end_blink = load_blink(d3.select(this).select("circle").node());
              var to_load = d.value.children.filter(Boolean).map(String);
              load_nodes(to_load,function(nodes){
                  end_blink();
                  layout.pdgtree.add(nodes);
                  drawTree(d3.transition().duration(700));
              });
            });
            var parent_expander = expanders.append("g").classed("parent-expander",true)
            parent_expander.append("path")
              .attr("fill","none")
              .attr("stroke","purple")
              .attr("stroke-width",4)
              .attr("d",curveline([[0,0],[0,-40]]));
            parent_expander.append("circle")
              .style("cursor","pointer")
              .attr("fill","purple")
              .attr("stroke","purple")
              .attr("cy",-45)
              .attr("r",10);
            parent_expander.append('text')
              .style("cursor","pointer")
              .attr('y',-39)
              .attr('x',-0.5)
              .attr("font-size","14px")
              .attr("font-weight","bold")
              .attr('text-anchor',"middle")
              .attr('class', 'glyphicon')
              .html("&#xe093;")
              .attr('fill',"white");
            parent_expander.on("click",function(d){
              d3.select(this).on('click',null);
              var end_blink = load_blink(d3.select(this).select("circle").node());
              var to_load = [d.value.mother_id,d.value.father_id].filter(Boolean).map(String);
              load_nodes(to_load,function(nodes){
                  end_blink();
                  layout.pdgtree.add(nodes);
                  drawTree(d3.transition().duration(700));
              });
            });
            nodeNodes.append('rect').classed("node-name-highlight",true)
              .attr('fill',function(d){
                  return d.id==root?"pink":"none";
              })
              .attr('stroke-width',0)
              .attr("width",220)
              .attr("height",40)
              .attr("y",-10)
              .attr("rx",20)
              .attr("ry",20)
              .attr("x",-110);
            nodeNodes.append('rect').classed("node-name-wrapper",true)
              .attr('fill',"white")
              .attr('stroke',"grey")
              .attr('stroke-width',2)
              .attr("width",200)
              .attr("height",20)
              .attr("y",0)
              .attr("rx",10)
              .attr("ry",10)
              .attr("x",-100);
            nodeNodes.append('text').classed('node-name-text',true)
              .attr('y',15)
              .attr('text-anchor',"middle")
              .text(function(d){
                return d.value.name;
              })
              .attr('fill',"black");
            //set node width to text width
            nodeNodes.each(function(d){
                var nn = d3.select(this);
                var ctl = nn.select('.node-name-text').node().getComputedTextLength();
                var w = ctl+20;
                nn.select('.node-name-wrapper')
                    .attr("width",w)
                    .attr("x",-w/2);
                nn.select('.node-name-highlight')
                    .attr("width",w+20)
                    .attr("x",-(w+20)/2);
            });
            var allNodes = newNodes.merge(nodes);
            //remove expander handles for nodes without unloaded relatives.
            allNodes.each(function(d){
                if (d.type=="node"){
                    var parents_unloaded = [d.value.mother_id,d.value.father_id]
                        .filter(function(node_id){
                            return !!node_id && !loaded_nodes.hasOwnProperty(node_id);
                        });
                    var children_unloaded = d.value.children
                        .filter(function(node_id){
                            return !!node_id && !loaded_nodes.hasOwnProperty(node_id);
                        });
                    if (parents_unloaded.length<1){
                        d3.select(this).selectAll(".parent-expander").remove();
                    }
                    if (children_unloaded.length<1){
                        d3.select(this).selectAll(".child-expander").remove();
                    }
                }
            });
            allNodes.transition(trans).attr('transform',function(d){
              return 'translate('+d.x+','+d.y+')'
            });
            allNodes.filter(function(d){return d.type=="node-group"})
              .style("cursor", "pointer")
              .on("click",function(d){
                layout.pdgtree.excludeFromGrouping(d.value.slice(0,10).map(function(d){return d.id;}));
                drawTree(d3.transition().duration(700).ease(d3.easeLinear));
            });
            var oldNodes = nodes.exit().remove();

            
            //link colors
            var link_color = function(d){
              if (d.type=="mid->child") return 'purple';
              if (d.type=="parent->mid"){
                //if its the first parent, red. Otherwise, blue.
                var representative = d.sinks[0].type=="node-group"?
                        d.sinks[0].value[0].value 
                        : d.sinks[0].value;
                if (representative.mother_id == d.source.id){
                    return "red";
                } 
                else {
                    return "blue";
                }
              }
              return 'gray';
            }
            
            //make links
            var links = linkLayer.selectAll('.link')
              .data(layout.links,function(d){return d.id;});
            var newLinks = links.enter().append('g')
              .classed('link',true);
            newLinks.append('path')
              .attr('d',function(d){
                var begin = (d.sink || d.source);
                if(d3.event && d3.event.type=="click"){
                  begin = d3.select(d3.event.target).datum();
                }
                return curveline([[begin.x,begin.y],[begin.x,begin.y],[begin.x,begin.y],[begin.x,begin.y]]);
              })
              .attr('fill','none')
              .attr('stroke',link_color)
              .attr('opacity',function(d){
                if (d.type=="parent->mid") return 0.7;
                return 0.999;
              })
              .attr('stroke-width',4);
            var allLinks = newLinks.merge(links);
            allLinks.transition(trans).select('path').attr('d',build_curve);
            var oldNodes = links.exit().remove();
        }
        
        return pdgv;
    }
    
    function load_blink(node){
        var stop = false;
        var original_fill = d3.select(node).style("fill");
        var original_sw = d3.select(node).style("stroke-width");
        function blink(){
            if (!stop) d3.select(node)
                .transition()
                .duration(300)
                .style("fill", "white")
                .style("stroke-width", "5")
                .transition()
                .duration(300)
                .style("fill", original_fill)
                .style("stroke-width", original_sw)
                .on("end", blink);
        }
        blink();
        return function(){
            stop = true;
        }
    }
      
    function get_fit_scale(w1,h1,w2,h2,pad){
        w1 -= pad*2;
        h1 -= pad*2;  
        if (w1/w2<h1/h2){
            return w1/w2;
        } else {
            return h1/h2;
        }
    }
    
})();
