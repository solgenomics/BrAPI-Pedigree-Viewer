;(function(){

$(document).ready(function(){
    $("#brapi-form").submit(function(){
        $("#load-spin").show();
        var form = $(this).serializeArray().reduce(function(vals,entry){
            vals[entry.name] = entry.value
            return vals
        },{});
        var pdg = PedigreeViewer(form.server);
        if (form.username){
            pdg.auth(form.username,form.password,function(){
                this.newTree(form.germplasm,draw)
            });
        }
        else {
            pdg.newTree(form.germplasm,draw);
        }
        return false;
    });
});
function draw(){
    $("#load-spin").hide();
    this.drawViewer("#pdgv-canv");
};
})();
